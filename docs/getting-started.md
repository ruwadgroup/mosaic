# Getting started

Render a Mosaic artifact in React, watch it degrade to plain text, and route an intent to your host - in about five minutes.

This guide assumes you are a **builder**: you own an AI app and want your agent's output to render as a real interface, in your look.
If you want the why before the how, read the [proposal](proposal.md) first.

Mosaic itself is an open specification - the [IR](language.md), the [manifest](rendering.md#the-host-manifest), and the [invariants](../ARCHITECTURE.md#invariants).
What you install here is the TypeScript **reference implementation** of it; a renderer for any other stack builds against the same contract.

## Install

The packages are not on npm yet; they build from this repo.

```bash
git clone https://github.com/ruwadgroup/mosaic.git
cd mosaic
pnpm install && pnpm build
```

That produces four packages under `packages/ts/`:

| Package         | What it gives you                                                      |
| --------------- | ---------------------------------------------------------------------- |
| `@mosaic/core`  | The compiler, the IR, `validate`, `resolve`, `expr`, `walk()` - no I/O |
| `@mosaic/react` | `render()` and `<Mosaic />` - the reference web renderer               |
| `@mosaic/ansi`  | `renderAnsi()` - the text floor                                        |
| `@mosaic/mcp`   | Optional MCP delivery - `ui://` resources and intent relay             |

In your own app, depend on them as workspace or file dependencies until they publish.

## First render

The model writes **mosaic-jsx** - a strict JSX pattern that carries no code.
Hand that source to `render()` and you get a live React element:

```tsx
import { render } from "@mosaic/react";

const source = `
<Card gap="3" state={{ eggs: 12 }}>
  <Slider label="Number of eggs" bind:state="eggs" min={0} max={144} step={1} />
  <Text size="xl">Total: {expr("formatCurrency(eggs * 0.50)")}</Text>
  <Text if:show="eggs > 60" tone="warn">Bulk order - wholesale pricing applies.</Text>
  <Button tone="primary" on:event={{ click: { action: "order", args: { eggs: expr("eggs"), total: expr("eggs * 0.50") } } }}>
    Place order
  </Button>
</Card>`;

function Artifact() {
  return render(source, {
    onAction: (action, args) => console.log("host intent:", action, args),
  });
}
```

Drag the slider and the total recomputes locally - `expr("eggs * 0.50")` is a [bounded expression](expr.md), not code.
The warning appears when `eggs > 60` holds.
Only the button crosses to your host: `onAction` receives `('order', { eggs: 80, total: 40 })` with the **computed** values, and your app decides what to do with them.
Nothing in the artifact can fetch, navigate, or run code ([invariants 1-4](../ARCHITECTURE.md#invariants)).

The component form is the same call:

```tsx
import { Mosaic } from "@mosaic/react";

<Mosaic source={source} onAction={handleIntent} />;
```

## Make it yours

By default the reference blocks draw with a built-in theme.
You own the design two ways, and they compose:

**Swap token values.** Pass a `theme` - a token-to-value map - and every reference block picks up your colors, spacing, radii, and fonts:

```tsx
render(source, { theme: myTheme, onAction });
```

**Swap whole blocks.** Pass `components` - your own React components, keyed by block type - and any block in the map renders through your implementation while Mosaic keeps owning the reactive loop:

```tsx
render(source, {
  components: { Card: MyCard, Button: MyButton, DataTable: MyTable },
  onAction,
});
```

Your component receives resolved props, rendered children, the bound state value with its setter, and ready-made event callbacks.
See [Rendering](rendering.md#the-hosts-own-components) for the full contract.

## The same artifact as text

Every artifact has a text floor.
`@mosaic/ansi` renders the identical source as readable terminal output - rich blocks decompose to primitives, controls print their state, and derived values still evaluate:

```ts
import { renderAnsi } from "@mosaic/ansi";

console.log(renderAnsi(source));
// │ Number of eggs: 12
// │ Total: $6.00
// │ [ Place order ]
```

Pass `{ color: true }` for ANSI colors; it is off by default so output pipes safely.

## Loading `.mosaic` files

An artifact travels as a fenced file - the fence carries the version and a stable id:

````text
```mosaic v=1 id=egg-order
<Card gap="3" state={{ eggs: 12 }}>
  …
</Card>
```
````

`render()` and `renderAnsi()` accept the fenced text directly.
To work with the document yourself, use the core:

```ts
import { loadMosaic, saveMosaic, serialize, validate, DEFAULT_MANIFEST } from "@mosaic/core";

const doc = loadMosaic(fileText); // throws JsxError on bad input
const result = validate(doc, DEFAULT_MANIFEST);
const json = serialize(doc); // canonical mosaic-json
const file = saveMosaic(doc); // back to a fenced .mosaic file
```

Complete hand-written artifacts - plans, comparisons, pricing estimators, diagrams - live in [`examples/`](../examples), and the [examples README](../examples/README.md) explains how to read them.

## See the demo

```bash
pnpm demo
```

That opens a full agent-workspace app where every assistant reply is a live artifact rendered through the app's own component kit - the `components` override in action.

From here, the [docs index](README.md) holds the full reference set; [State and events](interactivity.md) and [the `expr` language](expr.md) are where most artifact-writing questions land.
