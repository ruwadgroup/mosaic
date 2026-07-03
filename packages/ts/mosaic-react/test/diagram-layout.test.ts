// layoutDiagram: determinism and geometry sanity on a request-path-shaped
// fixture (10 nodes, 2 groups, a group edge), both directions.

import { describe, expect, it } from 'vitest';
import { type DiagramLayoutRect, layoutDiagram } from '../src/diagram-layout.js';

const FIXTURE = {
  nodes: [
    { id: 'client', label: 'Client', kind: 'client' },
    { id: 'edge', label: 'Edge', sublabel: 'CDN + WAF' },
    { id: 'auth', label: 'Auth', group: 'services' },
    { id: 'api', label: 'API', group: 'services', badge: 'p95 340ms' },
    { id: 'billing', label: 'Billing', group: 'services' },
    { id: 'pg', label: 'Postgres', kind: 'store', group: 'stores' },
    { id: 'redis', label: 'Redis', kind: 'store', group: 'stores' },
    { id: 'queue', label: 'Jobs queue', kind: 'queue', tone: 'warn' },
    { id: 'worker', label: 'Worker' },
    { id: 'mail', label: 'Mail relay', kind: 'external' },
  ],
  edges: [
    { from: 'client', to: 'edge' },
    { from: 'edge', to: 'auth' },
    { from: 'edge', to: 'api' },
    { from: 'api', to: 'billing' },
    { from: 'auth', to: 'redis' },
    { from: 'api', to: 'pg' },
    { from: 'api', to: 'queue', dashed: true },
    { from: 'queue', to: 'worker' },
    { from: 'worker', to: 'mail' },
    { from: 'services', to: 'redis', label: 'reads' }, // group edge: attaches to the hull
  ],
  groups: [
    { id: 'services', label: 'Services' },
    { id: 'stores', label: 'Stores' },
  ],
};

const GROUP_OF: Record<string, string> = {
  auth: 'services',
  api: 'services',
  billing: 'services',
  pg: 'stores',
  redis: 'stores',
};

function overlaps(a: DiagramLayoutRect, b: DiagramLayoutRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(hull: DiagramLayoutRect, r: DiagramLayoutRect): boolean {
  return (
    r.x >= hull.x && r.y >= hull.y && r.x + r.w <= hull.x + hull.w && r.y + r.h <= hull.y + hull.h
  );
}

describe('layoutDiagram', () => {
  for (const direction of ['right', 'down'] as const) {
    it(`direction "${direction}": deterministic, overlap-free, hulls contain members`, () => {
      const a = layoutDiagram({ ...FIXTURE, direction });
      const b = layoutDiagram({ ...FIXTURE, direction });
      expect(a).toEqual(b); // two runs are deeply equal: no randomness, no Date

      expect(a.nodes).toHaveLength(10);
      expect(a.groups).toHaveLength(2);
      expect(a.edges).toHaveLength(10);

      // no two node boxes overlap
      for (let i = 0; i < a.nodes.length; i++) {
        for (let j = i + 1; j < a.nodes.length; j++) {
          const ni = a.nodes[i] as DiagramLayoutRect;
          const nj = a.nodes[j] as DiagramLayoutRect;
          expect(overlaps(ni, nj), `${ni.id} overlaps ${nj.id}`).toBe(false);
        }
      }

      // group hulls do not overlap each other; each contains exactly its members
      const [services, stores] = a.groups as [DiagramLayoutRect, DiagramLayoutRect];
      expect(overlaps(services, stores)).toBe(false);
      for (const node of a.nodes) {
        const gid = GROUP_OF[node.id];
        for (const hull of a.groups) {
          if (hull.id === gid) {
            expect(contains(hull, node), `${node.id} escapes hull ${gid}`).toBe(true);
          } else {
            expect(overlaps(hull, node), `${node.id} intrudes into hull ${hull.id}`).toBe(false);
          }
        }
      }

      // groups sit in declaration order along the main axis
      const axis = direction === 'down' ? 'y' : 'x';
      expect(services[axis] + (direction === 'down' ? services.h : services.w)).toBeLessThan(
        stores[axis],
      );

      // everything fits the reported canvas
      for (const r of [...a.nodes, ...a.groups]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(a.width);
        expect(r.y + r.h).toBeLessThanOrEqual(a.height);
      }

      // edges route as straight (2-point) or quadratic (3-point) polylines
      for (const e of a.edges) {
        expect([2, 3]).toContain(e.points.length);
      }
    });
  }

  it('handles empty and malformed input without throwing', () => {
    expect(layoutDiagram({})).toEqual({ width: 12, height: 12, nodes: [], edges: [], groups: [] });
    const messy = layoutDiagram({
      nodes: [{ id: 'a', label: 'A' }, 'junk', { label: 'no id' }],
      edges: [{ from: 'a', to: 'ghost' }, { from: 'a' }],
      groups: [{ id: 'g', label: 'Empty group' }],
    });
    expect(messy.nodes).toHaveLength(1);
    expect(messy.edges).toHaveLength(0); // dangling endpoints drop the edge
    expect(messy.groups).toHaveLength(0); // empty groups get no hull
  });
});
