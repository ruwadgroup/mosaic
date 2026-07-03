import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const EXAMPLES_DIR = join(import.meta.dirname, '../../../../examples');

const EGG_SLIDER = `
<Card gap="3" state={{ eggs: 80 }}>
  <Slider label="Number of eggs" bind:state="eggs" min={0} max={144} step={1} />
  <Text size="xl">Total: {expr("formatCurrency(eggs * 0.50)")}</Text>
  <Text if:show="eggs > 60" tone="warn">Bulk order - wholesale pricing applies.</Text>
  <Button on:event={{ click: { action: "order", args: { eggs: expr("eggs"), total: expr("eggs * 0.50") } } }}>
    Place order
  </Button>
</Card>`;

describe('@mosaic/react', () => {
  it('renders the egg slider with derived values computed', () => {
    const html = renderToStaticMarkup(render(EGG_SLIDER));
    expect(html).toContain('$40.00');
    expect(html).toContain('Bulk order');
    expect(html).toContain('type="range"');
    expect(html).toContain('Place order');
  });

  it('if:show responds to initial state', () => {
    const html = renderToStaticMarkup(
      render('<Stack state={{ eggs: 10 }}><Text if:show="eggs > 60">Bulk</Text></Stack>'),
    );
    expect(html).not.toContain('Bulk');
  });

  it('applies theme tokens, never raw values from the artifact', () => {
    const html = renderToStaticMarkup(render('<Badge tone="ok">strong fit</Badge>'));
    expect(html).toContain('#10b981'); // the *theme's* value for tone=ok
  });

  it('rejects invalid artifacts before rendering', () => {
    expect(() => render('<Chart type="bar" series={[]} />')).toThrow(/MISSING_REQUIRED_PROP/);
    expect(() => render('<div>html</div>')).toThrow(/LOWERCASE_TAG/);
  });

  it('renders every example in the gallery', () => {
    for (const file of readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.mosaic'))) {
      const text = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const html = renderToStaticMarkup(render(text));
      expect(html.length, file).toBeGreaterThan(100);
    }
  });

  it("the host's own components override the reference blocks", () => {
    const html = renderToStaticMarkup(
      render(
        '<Stack state={{ eggs: 4 }}><Badge tone="ok">fit</Badge><Stat label="Eggs" value={expr("eggs * 2")} /></Stack>',
        {
          components: {
            Badge: ({ props, children }) =>
              createElement('span', { className: `chip chip-${String(props.tone)}` }, ...children),
            Stat: ({ props }) => createElement('dl', null, `${props.label}=${props.value}`),
          },
        },
      ),
    );
    expect(html).toContain('chip chip-ok');
    expect(html).toContain('Eggs=8'); // resolved props reach the host component
  });

  it('for:each renders one subtree per item', () => {
    const html = renderToStaticMarkup(
      render(`
        <Stack state={{ rows: [{ name: "alpha" }, { name: "beta" }] }}>
          <Text for:each="rows as row">{expr("row.name")}</Text>
        </Stack>`),
    );
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
  });
});
