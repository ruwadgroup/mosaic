// @vitest-environment jsdom
//
// The reactive loop, end to end in a real DOM: a control writes state, derived
// values recompute, a conditional flips, and a button hands the host a
// computed intent.

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EGG_SLIDER = `
<Card gap="3" state={{ eggs: 80 }}>
  <Slider label="Number of eggs" bind:state="eggs" min={0} max={144} step={1} />
  <Text size="xl">Total: {expr("formatCurrency(eggs * 0.50)")}</Text>
  <Text if:show="eggs > 60" tone="warn">Bulk order</Text>
  <Button on:event={{ click: { action: "order", args: { eggs: expr("eggs"), total: expr("eggs * 0.50") } } }}>
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

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('slider drives the derived total and the conditional, locally', async () => {
    const intents: Array<{ action: string; args?: unknown }> = [];
    await act(async () => {
      root.render(
        render(EGG_SLIDER, { onAction: (action, args) => void intents.push({ action, args }) }),
      );
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

    expect(intents).toEqual([{ action: 'order', args: { eggs: 10, total: 5 } }]);
  });

  it('segmented control swaps if:show subtrees with no round-trip', async () => {
    await act(async () => {
      root.render(
        render(`
          <Stack gap="2" state={{ audience: "SaaS" }}>
            <SegmentedControl bind:state="audience" options={["SaaS", "Bank"]} />
            <Text if:show="audience == 'SaaS'">saas-verdict</Text>
            <Text if:show="audience == 'Bank'">bank-verdict</Text>
          </Stack>`),
      );
    });
    expect(container.textContent).toContain('saas-verdict');
    expect(container.textContent).not.toContain('bank-verdict');

    const bank = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Bank',
    ) as HTMLButtonElement;
    await act(async () => {
      bank.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('bank-verdict');
    expect(container.textContent).not.toContain('saas-verdict');
  });

  it('Tabs opens on the default tab and switches on click', async () => {
    await act(async () => {
      root.render(
        render(`
          <Tabs active="Two" items={["One", "Two"]}>
            <Text>panel-one</Text>
            <Text>panel-two</Text>
          </Tabs>`),
      );
    });
    expect(container.textContent).toContain('panel-two');
    expect(container.textContent).not.toContain('panel-one');

    const one = [...container.querySelectorAll('[role="tab"]')].find(
      (b) => b.textContent === 'One',
    ) as HTMLButtonElement;
    await act(async () => {
      one.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('panel-one');
    expect(container.textContent).not.toContain('panel-two');
  });

  it('MultiSelect toggles an array in state', async () => {
    await act(async () => {
      root.render(
        render(`
          <Stack state={{ channels: ["email"] }}>
            <MultiSelect label="Notify" bind:state="channels" options={["email", "push", "SMS"]} />
            <Text>{expr("concat('picked:', join(channels, '+'))")}</Text>
          </Stack>`),
      );
    });
    expect(container.textContent).toContain('picked:email');

    const push = [...container.querySelectorAll('[role="option"]')].find((b) =>
      b.textContent?.includes('push'),
    ) as HTMLButtonElement;
    await act(async () => {
      push.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('picked:email+push');
  });

  it('Autocomplete filters locally and commits the pick to state', async () => {
    await act(async () => {
      root.render(
        render(`
          <Stack state={{ timezone: "" }}>
            <Autocomplete label="Timezone" bind:state="timezone"
              options={["Europe/Berlin", "Europe/London", "Asia/Dhaka"]} />
            <Text if:show="timezone == 'Asia/Dhaka'">tz-committed</Text>
          </Stack>`),
      );
    });
    const input = container.querySelector('[role="combobox"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'dha');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const options = [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options).toEqual(['Asia/Dhaka']);

    await act(async () => {
      (container.querySelector('[role="option"]') as HTMLButtonElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(container.textContent).toContain('tz-committed');
  });

  it('state.toggle handles local mutations without reaching the host', async () => {
    const intents: string[] = [];
    await act(async () => {
      root.render(
        render(
          `
          <Stack state={{ open: false }}>
            <Button on:event={{ click: "state.toggle('open')" }}>More</Button>
            <Text if:show="open">details</Text>
          </Stack>`,
          { onAction: (action) => void intents.push(action) },
        ),
      );
    });
    expect(container.textContent).not.toContain('details');

    const button = container.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('details');
    expect(intents).toEqual([]); // local mutation never left the artifact
  });
});
