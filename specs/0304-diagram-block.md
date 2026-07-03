---
id: 0304
title: The Diagram block - declarative nodes/edges/groups with renderer-owned layout
slug: 0304-diagram-block
stage: 3
status: done
packages: [mosaic-core, mosaic-react, mosaic-ansi]
proposal_sections: ['§4.3']
depends_on: [0301, 0104]
invariants: [7, 8]
---

# 0304 - The `Diagram` block: declarative nodes/edges/groups with renderer-owned layout

## Problem

Mosaic's diagram story is raw SVG.
When an agent wants an architecture flow, a decision funnel, or a before/after concept map, `Canvas` makes it hand-write SVG with hardcoded coordinates and raw colors.
That is token-expensive, unthemeable (invariant 6 is bypassed in spirit), invisible to the host, and has no text floor.
Research on real Claude-artifact usage shows these explainer graphics - flows, funnels, layered maps, concept shifts, toned timelines - are a dominant genre of what agents produce, and today every one of them is hundreds of hand-placed SVG elements.

## Goals / non-goals

Goals:

- A declarative `Diagram` rich block: nodes, edges, optional groups; semantic `kind`/`tone` tokens; the renderer owns all geometry.
- Selection as state: clicking a node writes its id to a bound state path, powering local detail panels and optional host intents.
- A normative `decomposeTo` text floor so the block renders everywhere.
- Expressiveness covering the reference explainer visuals: request-path flows, decision funnels (`direction="down"`), layered system maps (ordered group bands), before/after concept shifts (group-to-group edges), many-to-one convergence flows.
- Rider: `Timeline` items gain optional `description` and `tone` so toned, described timelines (incident histories, roadmaps) stop being hand-drawn SVG.

Non-goals:

- No third-party layout dependency (dagre/ELK); no force-directed or orthogonal routing.
- No leader-line "anatomy" layouts; precise annotated-string graphics stay `Canvas` territory.
- No block-per-idiom: ladders and steppers compose from existing primitives, not from `Diagram`.
- `Canvas` is reworded (the bespoke-SVG escape hatch), not removed.
- No editorial-vocabulary work (Text roles, Card tone, Compare layout); that is a follow-up spec.

## Model impact

- **Registry**: new rich data/viz block `Diagram` (`kind: 'data'`, `rich: true`, required `alt`, normative `decomposeTo`); `Timeline`'s item schema tightens to `{date, title, description?, tone?}`.
- **Catalog** (§4.3): `Diagram` row added; `Canvas` row reworded to the escape hatch for what `Diagram`/`Chart`/`VegaChart` cannot express.
- **Directives**: no new directives; `Diagram` uses `bind:state` (selection) and `on:event` (`select`) with their existing semantics.
- **Invariant 7** (every visual block carries `alt`): satisfied - `Diagram` requires `alt` and fails validation without it.
- **Invariant 8** (rich components decompose to primitives): satisfied - `Diagram` ships a normative `decomposeTo` recipe (below).
- **Invariant 6** (the host owns the design): strengthened in practice - node colors are tone tokens and positions are renderer-owned, replacing raw-value SVG.
  No invariant is weakened, so this spec carries no `proposal` tag.

## Design

### Props schema

```ts
type DiagramProps = {
  alt: string;                       // required (invariant 7)
  direction?: 'right' | 'down';      // layout axis, default 'right'
  nodes: Array<{
    id: string;                      // unique across nodes and groups
    label: string;
    sublabel?: string;               // second line, e.g. "Expensive, human-paced"
    kind?: 'service' | 'store' | 'queue' | 'client' | 'external' | 'concept' | 'code';
                                     // semantic shape token; 'code' renders mono;
                                     // an unknown kind renders as the default box (forward-compatible)
    tone?: string;                   // semantic tone token (ok | warn | bad | neutral | ...)
    badge?: string;                  // short annotation, e.g. "p95 340ms"
    group?: string;                  // -> groups[].id
    detail?: string;                 // one-liner surfaced by renderers on selection/hover
  }>;
  edges: Array<{
    from: string;                    // -> nodes[].id or groups[].id (a group edge attaches to the hull)
    to: string;                      // -> nodes[].id or groups[].id
    label?: string;
    tone?: string;
    dashed?: boolean;                // async / optional path
    bidirectional?: boolean;         // default false (directed)
  }>;
  groups?: Array<{ id: string; label: string; tone?: string }>;
};
```

Grouped nodes are laid out together, and groups are placed in declaration order along the `direction` axis.
A stratified "layer map" is therefore just `direction="down"` plus ordered groups, with or without cross-group edges.

### Interactivity contract

- `bind:state="selected"` on the `Diagram` two-way binds the **selected node id** (string or `null`).
  Clicking a node writes its id; clicking the background writes `null`.
  This powers local detail panels: `<Card if:show="selected == 'auth'">`.
- `on:event={{ select: { action: "...", args: {...} } }}` optionally escalates a selection to the host; the dispatched args gain `{ id }`.
- Non-interactive renderers draw the static diagram and ignore both, like every other control.

### Validation

- `alt` required (registry `requiredProps`).
- Duplicate ids across `nodes[].id` and `groups[].id` -> error.
- `edges[].from` / `edges[].to` referencing an id that is neither a node nor a group -> error.
- `nodes[].group` referencing an unknown `groups[].id` -> error.
- Error code: `INVALID_DIAGRAM`.

### `decomposeTo` (the text floor)

A `Stack`: bold `Text` = `alt`; per group a bold `Text` heading with its member nodes as `- label (kind)` lines; ungrouped nodes likewise; then one `Text` per edge: `from-label -> to-label - edge-label` (ASCII arrow).
This renders through `mosaic-ansi` with zero ANSI changes via the existing decompose hook.

### Layout: renderer-owned, reference implementation dependency-free

Positions are structure, not aesthetics: the host owns colors/shape/spacing via tokens, the renderer owns geometry.
`mosaic-react` ships and exports a deterministic pure helper:

```ts
layoutDiagram(props: DiagramProps): {
  width: number; height: number;
  nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>;
  edges: Array<{ from: string; to: string; points: Array<{x: number; y: number}> }>;
  groups: Array<{ id: string; x: number; y: number; w: number; h: number }>;
}
```

Algorithm: layered (Sugiyama-lite) - longest-path layering along `direction`, a few barycenter ordering sweeps to reduce crossings, label-derived box sizing, straight/quadratic edge routing, group hulls around member bounds.
Deterministic (no randomness, no `Date`) so SSR snapshots and tests are stable.
No third-party dependency: agent-emitted diagrams are small (5-30 nodes), so dagre/ELK generality is not worth `mosaic-react`'s first runtime dependency; a host that wants ELK plugs its own component in via `opts.components.Diagram`.

The reference React renderer draws SVG: group hulls behind, rounded-rect nodes (shape variant per `kind`, colors via tone classes), arrowhead markers, `dashed` strokes, badges as corner chips, and a selection ring on the node whose id equals the bound value.

### Rider: enriched `Timeline` items

```ts
type TimelineItem = { date: string; title: string; description?: string; tone?: string };
```

The reference renderer draws tone-colored markers and description lines; `decomposeTo` includes the description; the ANSI floor keeps `date - title` plus the description.
No new interactivity; `for:each` / `if:show` compose as usual.

## Package(s) affected

- `mosaic-core`: registry entry, `decomposeTo` recipe, `INVALID_DIAGRAM` structural validation, tightened `Timeline` item schema.
- `mosaic-react`: `layoutDiagram` helper (exported), the reference SVG renderer, selection/`select` wiring, Timeline tone/description rendering.
- `mosaic-ansi`: no code - the Diagram floor arrives through the existing decompose hook; gallery tests assert it.
- Dependency direction unchanged: `mosaic-react` and `mosaic-ansi` depend on `mosaic-core`.

## Acceptance criteria

- A `Diagram` source compiles to the expected IR and serializes to canonical JSON byte-identically through the round-trip gallery.
- A `Diagram` without `alt`, with duplicate ids, with a dangling edge endpoint, or with a dangling `nodes[].group` fails validation with `INVALID_DIAGRAM` (or the missing-required-prop error for `alt`).
- `layoutDiagram` is deterministic (two runs deep-equal) and produces no overlapping node boxes on a 10-node fixture.
- Clicking a node writes its id to the bound path and an `if:show` detail panel swaps; clicking the background writes `null`; an authored `select` intent dispatches with `{ id }` merged into args.
- In a non-interactive or unsupporting renderer, the diagram renders its `decomposeTo` expansion: `alt`, group headings, `- label (kind)` node lines, and `from -> to` edge lines.
- A `Timeline` with `description`/`tone` renders both in React and renders date, title, and description through ANSI.

## Test plan

- Unit (core): valid/invalid Diagram fixtures - duplicate id, dangling edge endpoint, dangling group ref; decompose output shape for Diagram and for a toned/described Timeline.
- Unit (react): layout determinism (two runs, deep-equal); no-overlap assertion on a 10-node fixture; SSR gallery stays green.
- Integration (jsdom): node click -> `if:show` panel swap; background click clears selection; `select` intent dispatch carries `{ id }`.
- ANSI: gallery iterates every example; a Diagram fixture renders its decompose expansion (node and `->` edge lines); a toned Timeline renders its description.
- Adversarial: edge cycles (layering must terminate), self-edges, a group with no members, 30-node fan-in, labels long enough to stress box sizing.

## Risks & open questions

- **Layout quality is the product risk**: a dependency-free Sugiyama-lite must read like a designed explainer graphic, not a graph dump, across the reference visuals.
  If it cannot within a bounded implementation, the fallback is explicit - stop and evaluate options rather than silently adopting dagre/ELK.
- Edge routing around group hulls is heuristic; dense cross-group edges may still cross visibly.
  Accepted for v1: agents' diagrams are small and the host override hatch exists.
- `kind` is an open token set by design; the schema documents the known kinds but renderers must treat unknown kinds as the default box, which trades validation strictness for forward compatibility.
- Whether `Diagram` should later gain hover tooltips from `detail` in non-selecting contexts is left to renderer discretion; the contract only requires surfacing on selection/hover.
