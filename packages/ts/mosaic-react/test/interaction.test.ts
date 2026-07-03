// @vitest-environment jsdom
//
// The reactive loop in a real DOM: a control writes state, derived values
// recompute, a conditional flips, and a button hands the host a computed
// intent. Also exercises advisory diagnostics, the error boundary, and a
// custom bound control.

import { createRegistry, defaultBlocks, defineBlockSchema, parse } from '@mosaicjs/core';
import { type ComponentType, act, createElement, useState } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Mosaic,
  type MosaicBlockProps,
  type MosaicProps,
  defineBlock,
  defineComponents,
} from '../src/index.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A minimal host component set: unstyled elements that wire the runtime's
// value/setValue/events contract the way any real host would.
const host = defineComponents({
  Card: ({ children }) => createElement('section', null, ...children),
  Stack: ({ children }) => createElement('div', null, ...children),
  Text: ({ children }) => createElement('p', null, ...children),
  Button: ({ children, events }) =>
    createElement('button', { type: 'button', onClick: events.click }, ...children),
  Slider: ({ props, value, setValue }) =>
    createElement('input', {
      type: 'range',
      'aria-label': props.label,
      min: props.min,
      max: props.max,
      step: props.step,
      value: Number(value ?? 0),
      onChange: (e: { target: HTMLInputElement }) => setValue?.(Number(e.target.value)),
    }),
  Tabs: function HostTabs({ props, children }) {
    const labels = props.items ?? [];
    const [active, setActive] = useState(props.active ?? labels[0] ?? '');
    const index = Math.max(labels.indexOf(String(active)), 0);
    return createElement(
      'div',
      null,
      createElement(
        'div',
        { role: 'tablist' },
        ...labels.map((label) =>
          createElement(
            'button',
            { key: label, type: 'button', role: 'tab', onClick: () => setActive(label) },
            label,
          ),
        ),
      ),
      children[index] ?? null,
    );
  },
});

const EGG_SLIDER = `
<Card state={{ eggs: 80 }}>
  <Slider label="Number of eggs" value={eggs} min={0} max={144} step={1} />
  <Text>Total: {formatCurrency(eggs * 0.50)}</Text>
  {eggs > 60 && <Text tone="warn">Bulk order</Text>}
  <Button variant="primary" onClick={order({ eggs: eggs, total: eggs * 0.50 })}>
    Place order
  </Button>
</Card>`;

function setRangeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the reactive loop in a DOM', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = async (props: MosaicProps) => {
    await act(async () => {
      root.render(createElement(Mosaic, props));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('slider drives the derived total and the conditional, and the button hands over a computed intent', async () => {
    const intents: Array<{ name: string; args?: unknown }> = [];
    await mount({
      source: EGG_SLIDER,
      components: host,
      onIntent: (name, args) => void intents.push({ name, args }),
    });
    expect(container.textContent).toContain('$40.00');
    expect(container.textContent).toContain('Bulk order');

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    await act(async () => setRangeValue(slider, '10'));
    expect(container.textContent).toContain('$5.00');
    expect(container.textContent).not.toContain('Bulk order');

    const button = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Place order'),
    ) as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(intents).toEqual([{ name: 'order', args: { eggs: 10, total: 5 } }]);
  });

  it('state.toggle mutates locally without reaching the host', async () => {
    const intents: string[] = [];
    await mount({
      source: `
        <Stack state={{ open: false }}>
          <Button onClick={toggle(open)}>More</Button>
          {open && <Text>details</Text>}
        </Stack>`,
      components: host,
      onIntent: (name) => void intents.push(name),
    });
    expect(container.textContent).not.toContain('details');
    const button = container.querySelector('button') as HTMLButtonElement;
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('details');
    expect(intents).toEqual([]);
  });

  it('Tabs opens on the default tab and switches on click', async () => {
    await mount({
      source: `
        <Tabs active="Two" items={["One", "Two"]}>
          <Text>panel-one</Text>
          <Text>panel-two</Text>
        </Tabs>`,
      components: host,
    });
    expect(container.textContent).toContain('panel-two');
    expect(container.textContent).not.toContain('panel-one');
    const one = [...container.querySelectorAll('[role="tab"]')].find(
      (b) => b.textContent === 'One',
    ) as HTMLButtonElement;
    await act(async () => one.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('panel-one');
    expect(container.textContent).not.toContain('panel-two');
  });

  it('reports removed props through onDiagnostics, once, without blanking', async () => {
    const batches: Array<Array<{ code: string; prop?: string }>> = [];
    await mount({
      source: '<Stack gap="3"><Text>kept</Text></Stack>',
      components: host,
      onDiagnostics: (d) => void batches.push(d),
    });
    expect(container.textContent).toContain('kept');
    expect(batches).toHaveLength(1);
    expect(batches[0]?.some((d) => d.code === 'REMOVED_PROP' && d.prop === 'gap')).toBe(true);
  });

  it('degrades a throwing component to its children', async () => {
    const Boom = (() => {
      throw new Error('boom');
    }) as ComponentType<MosaicBlockProps>;
    await mount({
      source: '<Stack><Text>safe</Text></Stack>',
      components: defineComponents({
        Stack: Boom,
        Text: ({ children }: MosaicBlockProps) => createElement('p', null, ...children),
      }),
    });
    expect(container.textContent).toContain('safe');
  });

  it('computed set() makes a working counter and digit pad', async () => {
    await mount({
      source: `
        <Stack state={{ count: 0, display: "" }}>
          <Button onClick={set(count, count + 1)}>+1</Button>
          <Button onClick={() => set(display, display + "7")}>7</Button>
          <Text>count:{count}</Text>
          <Text>display:[{display}]</Text>
        </Stack>`,
      components: host,
    });
    const click = async (label: string) => {
      const b = [...container.querySelectorAll('button')].find(
        (el) => el.textContent === label,
      ) as HTMLButtonElement;
      await act(async () => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    };
    await click('+1');
    await click('+1');
    expect(container.textContent).toContain('count:2');
    await click('7');
    await click('7');
    expect(container.textContent).toContain('display:[77]');
  });

  it('two-way binds a custom control via bind:state', async () => {
    const KnobSchema = defineBlockSchema({
      name: 'Knob',
      kind: 'control',
      doc: 'A test knob.',
      props: { label: { type: 'string', doc: 'Label.' } },
      example: '<Knob label="x" />',
    });
    const Knob = defineBlock(KnobSchema, ({ value, setValue }) =>
      createElement(
        'button',
        { type: 'button', onClick: () => setValue?.('b') },
        String(value ?? ''),
      ),
    );
    const registry = createRegistry([...defaultBlocks, KnobSchema]);
    // parse binds value={path} for built-ins only, so a custom control carries
    // an explicit bind:state directive; the runtime supplies value/setValue.
    const parsed = parse('<Stack state={{ k: "a" }}><Knob /><Text>picked:{k}</Text></Stack>');
    if (!parsed.ok) throw new Error('fixture did not parse');
    const knobNode = parsed.doc.root.children?.[0];
    if (knobNode) knobNode.directives = { 'bind:state': 'k' };
    await mount({
      source: parsed.doc,
      components: { ...host, ...Knob.component },
      registry,
    });
    expect(container.textContent).toContain('picked:a');
    const knob = container.querySelector('button') as HTMLButtonElement;
    await act(async () => knob.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('picked:b');
  });
});
