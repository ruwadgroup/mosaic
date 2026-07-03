// diagram-layout: the deterministic layered layout behind the reference
// Diagram renderer (docs/proposal.md §4.3). Sugiyama-lite: longest-path
// layering along the direction axis, a few barycenter ordering sweeps for
// crossing reduction, label-derived box sizing, groups as ordered bands along
// the main axis with hull rectangles, straight or quadratic edge routing.
// Pure and dependency-free - no randomness, no Date - so SSR snapshots and
// tests are stable. A host that wants ELK-grade layout plugs its own Diagram
// component in via opts.components.

export type DiagramLayoutRect = { id: string; x: number; y: number; w: number; h: number };

export type DiagramLayoutEdge = {
  from: string;
  to: string;
  /** 2 points = straight segment, 3 points = quadratic (middle is the control). */
  points: Array<{ x: number; y: number }>;
};

export type DiagramLayout = {
  width: number;
  height: number;
  nodes: DiagramLayoutRect[];
  edges: DiagramLayoutEdge[];
  groups: DiagramLayoutRect[];
};

/** Loosely typed on purpose: the renderer hands resolved props straight in. */
export type DiagramLayoutInput = {
  direction?: unknown;
  nodes?: unknown;
  edges?: unknown;
  groups?: unknown;
};

type Rec = Record<string, unknown>;
type Pt = { x: number; y: number };

const MARGIN = 12;
const LAYER_GAP = 60; // gap between layer slots along the main axis
const CROSS_GAP = 14; // gap between sibling boxes on the cross axis
const GROUP_GAP = 52; // extra cross-axis clearance entering/leaving a group block
const HULL_PAD = 14;
const HULL_LABEL = 20; // headroom for the group label inside the hull
const MIN_W = 96;
const MAX_W = 248;

function recs(v: unknown): Rec[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Rec => x !== null && typeof x === 'object' && !Array.isArray(x));
}

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  return v === null || v === undefined || typeof v === 'object' ? '' : String(v);
}

/** Box sizing derived from the text lengths (no DOM measurement: pure). */
function boxSize(n: Rec): { w: number; h: number } {
  const label = text(n.label) || text(n.id);
  const sub = text(n.sublabel);
  const badge = text(n.badge);
  const w = Math.max(label.length * 7.4, sub.length * 6.2, badge.length * 6.2 + 16) + 28;
  return { w: Math.round(Math.min(Math.max(w, MIN_W), MAX_W)), h: sub ? 52 : 36 };
}

/** Longest-path layering by relaxation; bounded passes make cycles safe. */
function longestPath(ids: Iterable<string>, edges: Array<[string, string]>): Map<string, number> {
  const layer = new Map<string, number>();
  for (const id of ids) layer.set(id, 0);
  const cap = layer.size;
  for (let pass = 0; pass <= cap; pass++) {
    let changed = false;
    for (const [a, b] of edges) {
      const want = (layer.get(a) ?? 0) + 1;
      if ((layer.get(b) ?? 0) < want && want <= cap) {
        layer.set(b, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

/** Attach an edge to the facing sides of two rects: straight when aligned,
 *  quadratic (control point = main-axis midpoint at the source's cross value)
 *  when the endpoints sit on different cross positions. */
function route(a: DiagramLayoutRect, b: DiagramLayoutRect, down: boolean): Pt[] {
  const main = (r: DiagramLayoutRect) => (down ? { lo: r.y, size: r.h } : { lo: r.x, size: r.w });
  const cross = (r: DiagramLayoutRect) => (down ? { lo: r.x, size: r.w } : { lo: r.y, size: r.h });
  const pt = (m: number, c: number): Pt =>
    down ? { x: Math.round(c), y: Math.round(m) } : { x: Math.round(m), y: Math.round(c) };
  const A = main(a);
  const B = main(b);
  const aC = cross(a).lo + cross(a).size / 2;
  const bC = cross(b).lo + cross(b).size / 2;
  // main-axis spans overlap (same layer): connect across the cross axis
  if (B.lo < A.lo + A.size && A.lo < B.lo + B.size) {
    const start = pt(A.lo + A.size / 2, bC >= aC ? cross(a).lo + cross(a).size : cross(a).lo);
    const end = pt(B.lo + B.size / 2, bC >= aC ? cross(b).lo : cross(b).lo + cross(b).size);
    return [start, end];
  }
  const forward = B.lo + B.size / 2 >= A.lo + A.size / 2;
  const fromM = forward ? A.lo + A.size : A.lo;
  const toM = forward ? B.lo : B.lo + B.size;
  const start = pt(fromM, aC);
  const end = pt(toM, bC);
  if (Math.abs(aC - bC) < 1) return [start, end];
  return [start, pt((fromM + toM) / 2, aC), end];
}

/** Deterministic layered layout for the Diagram block. Pure function of its
 *  input: two calls with equal props return deeply equal geometry. */
export function layoutDiagram(props: DiagramLayoutInput): DiagramLayout {
  const down = props.direction === 'down';
  const groups = recs(props.groups).filter((g) => text(g.id) !== '');
  const groupIndex = new Map<string, number>();
  groups.forEach((g, i) => groupIndex.set(text(g.id), i));
  const nodeById = new Map<string, Rec>();
  for (const n of recs(props.nodes)) {
    const id = text(n.id);
    if (id !== '' && !nodeById.has(id)) nodeById.set(id, n);
  }
  const placed = [...nodeById.keys()];
  const edgesIn = recs(props.edges).filter((e) => text(e.from) !== '' && text(e.to) !== '');
  const groupOf = (id: string): string | undefined => {
    const g = text(nodeById.get(id)?.group);
    return g !== '' && groupIndex.has(g) ? g : undefined;
  };

  // 1. Layer the contracted graph (each group is one unit, so bands move as a
  //    whole; group-edge endpoints already address the unit), then force group
  //    units into declaration order along the main axis.
  const unitOf = (id: string): string | undefined => {
    if (groupIndex.has(id)) return `g:${id}`;
    if (!nodeById.has(id)) return undefined;
    const g = groupOf(id);
    return g ? `g:${g}` : `n:${id}`;
  };
  const units = new Set<string>(groups.map((g) => `g:${text(g.id)}`));
  for (const id of placed) units.add(unitOf(id) as string);
  const contracted: Array<[string, string]> = [];
  for (const e of edgesIn) {
    const a = unitOf(text(e.from));
    const b = unitOf(text(e.to));
    if (a !== undefined && b !== undefined && a !== b) contracted.push([a, b]);
  }
  const unitLayer = longestPath(units, contracted);
  let prevBand = -1;
  for (const g of groups) {
    const u = `g:${text(g.id)}`;
    const sl = Math.max(unitLayer.get(u) ?? 0, prevBand + 1);
    unitLayer.set(u, sl);
    prevBand = sl;
  }

  // 2. Relative layers inside each band (longest path over intra-group edges).
  const intra: Array<[string, string]> = [];
  for (const e of edgesIn) {
    const from = text(e.from);
    const to = text(e.to);
    const g = groupOf(from);
    if (g !== undefined && g === groupOf(to) && from !== to) intra.push([from, to]);
  }
  const rel = longestPath(placed, intra);
  const span = new Map<string, number>();
  for (const id of placed) {
    const g = groupOf(id);
    if (g) span.set(g, Math.max(span.get(g) ?? 1, (rel.get(id) ?? 0) + 1));
  }

  // 3. Expand unit layers into actual layers: a unit layer is as thick as its
  //    widest band, so grouped nodes keep their internal layering.
  const slWidth = new Map<number, number>();
  for (const u of units) {
    const sl = unitLayer.get(u) ?? 0;
    const w = u.startsWith('g:') ? (span.get(u.slice(2)) ?? 1) : 1;
    slWidth.set(sl, Math.max(slWidth.get(sl) ?? 0, w));
  }
  const slStart = new Map<number, number>();
  let nextStart = 0;
  for (const sl of [...slWidth.keys()].sort((x, y) => x - y)) {
    slStart.set(sl, nextStart);
    nextStart += slWidth.get(sl) ?? 1;
  }
  const layerOf = new Map<string, number>();
  for (const id of placed) {
    const g = groupOf(id);
    const start = slStart.get(unitLayer.get(g ? `g:${g}` : `n:${id}`) ?? 0) ?? 0;
    layerOf.set(id, start + (g ? (rel.get(id) ?? 0) : 0));
  }

  // 4. Cross-axis ordering: declaration order, then barycenter sweeps against
  //    each adjacent layer, then group blocks pulled contiguous so hulls stay
  //    tight. Stable sorts + explicit tie-breaks keep it deterministic.
  const layerCount = placed.length > 0 ? Math.max(...layerOf.values()) + 1 : 0;
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  for (const id of placed) layers[layerOf.get(id) ?? 0]?.push(id);
  const neighbors = new Map<string, string[]>();
  for (const e of edgesIn) {
    const from = text(e.from);
    const to = text(e.to);
    if (!nodeById.has(from) || !nodeById.has(to)) continue;
    neighbors.set(from, [...(neighbors.get(from) ?? []), to]);
    neighbors.set(to, [...(neighbors.get(to) ?? []), from]);
  }
  const order = new Map<string, number>();
  for (const layer of layers) layer.forEach((id, i) => order.set(id, i));
  const sortLayer = (layer: string[], keyOf: (id: string) => number): void => {
    layer.sort((x, y) => keyOf(x) - keyOf(y) || (order.get(x) ?? 0) - (order.get(y) ?? 0));
    layer.forEach((id, i) => order.set(id, i));
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    const forward = sweep % 2 === 0;
    for (let i = 0; i < layers.length; i++) {
      const f = forward ? i : layers.length - 1 - i;
      const adj = forward ? f - 1 : f + 1;
      if (adj < 0 || adj >= layers.length) continue;
      sortLayer(layers[f] as string[], (id) => {
        const near = (neighbors.get(id) ?? []).filter((o) => layerOf.get(o) === adj);
        if (near.length === 0) return order.get(id) ?? 0;
        return near.reduce((s, o) => s + (order.get(o) ?? 0), 0) / near.length;
      });
    }
  }
  // Pull each group's members contiguous within their layer (so the hull stays
  // tight): blocks ordered by mean barycenter position, members keep theirs.
  for (const layer of layers) {
    const blocks = new Map<string, string[]>();
    for (const id of layer) {
      const b = groupOf(id) ?? `:${id}`;
      blocks.set(b, [...(blocks.get(b) ?? []), id]);
    }
    const mean = (ids: string[]): number =>
      ids.reduce((s, o) => s + (order.get(o) ?? 0), 0) / ids.length;
    const sorted = [...blocks.values()].sort(
      (x, y) =>
        mean(x) - mean(y) || (order.get(x[0] as string) ?? 0) - (order.get(y[0] as string) ?? 0),
    );
    layer.splice(0, layer.length, ...sorted.flat());
    layer.forEach((id, i) => order.set(id, i));
  }

  // 5. Coordinates: layers along the main axis, stacked boxes on the cross
  //    axis (extra clearance around group blocks), each layer centered.
  const size = new Map(placed.map((id) => [id, boxSize(nodeById.get(id) as Rec)]));
  const mainSize = (id: string): number => (down ? size.get(id)?.h : size.get(id)?.w) ?? 0;
  const crossSize = (id: string): number => (down ? size.get(id)?.w : size.get(id)?.h) ?? 0;
  const thickness = layers.map((layer) => Math.max(0, ...layer.map(mainSize)));
  const mainStart: number[] = [];
  let atMain = MARGIN;
  for (const th of thickness) {
    mainStart.push(atMain);
    atMain += th + LAYER_GAP;
  }
  const crossPos = new Map<string, number>();
  const extents = layers.map((layer) => {
    let at = 0;
    let prevG: string | undefined;
    layer.forEach((id, i) => {
      const g = groupOf(id);
      if (i > 0)
        at += g !== prevG && (g !== undefined || prevG !== undefined) ? GROUP_GAP : CROSS_GAP;
      crossPos.set(id, at);
      at += crossSize(id);
      prevG = g;
    });
    return at;
  });
  const maxExtent = Math.max(0, ...extents);
  const nodes: DiagramLayoutRect[] = placed.map((id) => {
    const f = layerOf.get(id) ?? 0;
    const box = size.get(id) as { w: number; h: number };
    const main = (mainStart[f] ?? MARGIN) + ((thickness[f] ?? 0) - mainSize(id)) / 2;
    const cross = MARGIN + (maxExtent - (extents[f] ?? 0)) / 2 + (crossPos.get(id) ?? 0);
    return down
      ? { id, x: cross, y: main, w: box.w, h: box.h }
      : { id, x: main, y: cross, w: box.w, h: box.h };
  });

  // 6. Group hulls: the members' bounding box plus padding and label headroom.
  const rectById = new Map(nodes.map((r) => [r.id, r]));
  const hulls: DiagramLayoutRect[] = [];
  for (const g of groups) {
    const gid = text(g.id);
    const members = placed.filter((id) => groupOf(id) === gid);
    if (members.length === 0) continue;
    const rects = members.map((id) => rectById.get(id) as DiagramLayoutRect);
    const x = Math.min(...rects.map((r) => r.x)) - HULL_PAD;
    const y = Math.min(...rects.map((r) => r.y)) - HULL_PAD - HULL_LABEL;
    hulls.push({
      id: gid,
      x,
      y,
      w: Math.max(...rects.map((r) => r.x + r.w)) + HULL_PAD - x,
      h: Math.max(...rects.map((r) => r.y + r.h)) + HULL_PAD - y,
    });
  }

  // 7. Normalize into the margin, round, then route edges (group endpoints
  //    attach to the hull rect; unknown endpoints drop the edge).
  const all = [...nodes, ...hulls];
  const dx = MARGIN - Math.min(MARGIN, ...all.map((r) => r.x));
  const dy = MARGIN - Math.min(MARGIN, ...all.map((r) => r.y));
  for (const r of all) {
    r.x = Math.round(r.x + dx);
    r.y = Math.round(r.y + dy);
    r.w = Math.round(r.w);
    r.h = Math.round(r.h);
  }
  const anchor = new Map<string, DiagramLayoutRect>();
  for (const r of hulls) anchor.set(r.id, r);
  for (const r of nodes) anchor.set(r.id, r);
  const edges: DiagramLayoutEdge[] = [];
  for (const e of edgesIn) {
    const a = anchor.get(text(e.from));
    const b = anchor.get(text(e.to));
    if (!a || !b) continue;
    edges.push({ from: text(e.from), to: text(e.to), points: route(a, b, down) });
  }

  return {
    width: Math.round(Math.max(0, ...all.map((r) => r.x + r.w)) + MARGIN),
    height: Math.round(Math.max(0, ...all.map((r) => r.y + r.h)) + MARGIN),
    nodes,
    edges,
    groups: hulls,
  };
}
