import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRegistry, defineBlockSchema } from '@mosaicjs/core';
import { describe, expect, it } from 'vitest';
import { renderAnsi } from '../src/index.js';

const EXAMPLES_DIR = join(import.meta.dirname, '../../../../examples');
const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.mosaic'));

describe('@mosaicjs/ansi', () => {
  it('renders text with derived values baked in', () => {
    const out = renderAnsi(`
      <Card state={{ eggs: 80 }}>
        <Slider label="Number of eggs" value={eggs} min={0} max={144} step={1} />
        <Text>Total: {formatCurrency(eggs * 0.50)}</Text>
        {eggs > 60 && <Text tone="warn">Bulk order</Text>}
      </Card>`);
    expect(out).toContain('$40.00');
    expect(out).toContain('Bulk order');
    expect(out).toContain('Number of eggs: 80');
  });

  it('is plain text by default, ANSI on request', () => {
    const plain = renderAnsi('<Heading>Plan</Heading>');
    expect(plain).not.toContain('[1m');
    const colored = renderAnsi('<Heading>Plan</Heading>', { color: true });
    expect(colored).toContain('[1m');
  });

  it('draws a DataTable with aligned columns', () => {
    const out = renderAnsi(
      '<DataTable columns={["Risk", "Impact"]} rows={[["Drift", "high"], ["Rate limit", "med"]]} />',
    );
    expect(out).toContain('Risk');
    expect(out).toMatch(/Drift\s+high/);
  });

  it('decomposes what it cannot draw (the floor)', () => {
    const out = renderAnsi(
      '<Chart type="donut" alt="Cost by plan" data={[{ label: "Pro", value: 1 }]} />',
    );
    expect(out).toContain('Cost by plan');
  });

  it('decomposes a Diagram to alt, group headings, node lines, and edge lines', () => {
    const out = renderAnsi(`
      <Diagram
        alt="Checkout request path"
        nodes={[
          { id: "client", label: "Client", kind: "client" },
          { id: "api", label: "API", kind: "service", group: "backend" },
          { id: "db", label: "Postgres", kind: "store", group: "backend" },
        ]}
        groups={[{ id: "backend", label: "Backend" }]}
        edges={[{ from: "client", to: "api", label: "HTTPS" }, { from: "api", to: "db" }]}
      />`);
    expect(out).toContain('Checkout request path');
    expect(out).toContain('Backend');
    expect(out).toContain('- API (service)');
    expect(out).toContain('- Postgres (store)');
    expect(out).toContain('- Client (client)');
    expect(out).toContain('Client -> API - HTTPS');
    expect(out).toContain('API -> Postgres');
  });

  it('renders a toned, described Timeline with date, title, and description', () => {
    const out = renderAnsi(`
      <Timeline items={[
        { date: "2026-03-01", title: "Alert fired", description: "p99 latency crossed 2s", tone: "bad" },
        { date: "2026-03-02", title: "Mitigated", tone: "ok" },
      ]} />`);
    expect(out).toContain('2026-03-01');
    expect(out).toContain('Alert fired');
    expect(out).toContain('p99 latency crossed 2s');
    expect(out).toContain('Mitigated');
    expect(out).not.toContain('bad');
    expect(out).not.toContain('—');
  });

  it('renders a custom expandsTo block via macro expansion', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option with price.',
      props: {
        airline: { type: 'string', required: true, doc: 'Carrier name.' },
        price: { type: 'string', required: true, doc: 'Display price.' },
      },
      example: '<FlightCard airline="ANA" price="$820" />',
      expandsTo: `<Stack direction="horizontal"><Text>{airline}</Text><Text>{price}</Text></Stack>`,
    });
    const registry = createRegistry([FlightCard]);
    const out = renderAnsi('<FlightCard airline="ANA" price="$820" />', { registry });
    expect(out).toContain('ANA');
    expect(out).toContain('$820');
  });

  describe('the example gallery renders to readable text', () => {
    it('found the example gallery', () => {
      expect(exampleFiles.length).toBeGreaterThanOrEqual(5);
    });

    for (const file of exampleFiles) {
      it(`${file} renders without throwing`, () => {
        const out = renderAnsi(readFileSync(join(EXAMPLES_DIR, file), 'utf8'));
        expect(out.trim().length, file).toBeGreaterThan(0);
      });
    }
  });
});
