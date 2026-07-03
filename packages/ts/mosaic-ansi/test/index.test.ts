import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderAnsi } from '../src/index.js';

const EXAMPLES_DIR = join(import.meta.dirname, '../../../../examples');

describe('@mosaic/ansi', () => {
  it('renders text with derived values baked in', () => {
    const out = renderAnsi(`
      <Card gap="3" state={{ eggs: 80 }}>
        <Slider label="Number of eggs" bind:state="eggs" min={0} max={144} step={1} />
        <Text size="xl">Total: {expr("formatCurrency(eggs * 0.50)")}</Text>
        <Text if:show="eggs > 60" tone="warn">Bulk order</Text>
      </Card>`);
    expect(out).toContain('$40.00');
    expect(out).toContain('Bulk order');
    expect(out).toContain('Number of eggs: 80');
  });

  it('is plain text by default, ANSI on request', () => {
    const plain = renderAnsi('<Heading>Plan</Heading>');
    expect(plain).not.toContain('[');
    const colored = renderAnsi('<Heading>Plan</Heading>', { color: true });
    expect(colored).toContain('[1m');
  });

  it('draws a DataTable with aligned columns', () => {
    const out = renderAnsi(
      '<DataTable columns={["Risk", "Impact"]} rows={[["Drift", "high"], ["Rate limit", "med"]]} />',
    );
    expect(out).toContain('Risk');
    expect(out).toMatch(/Drift\s+high/);
  });

  it('decomposes what it cannot draw (the floor)', () => {
    const out = renderAnsi('<Chart type="donut" alt="Cost by plan" series={[]} />');
    expect(out).toContain('Cost by plan');
  });

  it('renders the full example gallery to readable text', () => {
    for (const file of [
      'plan-migration.mosaic',
      'pricing-estimator.mosaic',
      'compare-memory-layer.mosaic',
    ]) {
      const out = renderAnsi(readFileSync(join(EXAMPLES_DIR, file), 'utf8'));
      expect(out.split('\n').length, file).toBeGreaterThan(10);
    }
  });
});
