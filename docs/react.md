# The React library

`@mosaicjs/react` is the provided React implementation of the [renderer contract](rendering.md).
The runtime is **headless**: it owns parse, validate, resolve, streaming, and state, and draws every block through the `components` map you pass.
The entire design is yours, which is the point of the format ([invariant 6](../ARCHITECTURE.md#invariants)).

## Install

```bash
npm install @mosaicjs/react @mosaicjs/core
```

`@mosaicjs/ansi` (the text floor) and `@mosaicjs/ai` (the [model-facing tools](mcp.md)) install the same way when you need them.

## First render

The model writes **mosaic-jsx** - standard JSX that is parsed and interpreted, never executed.
Hand that source to `<Mosaic>` with a `components` map and you get a live React element:

```tsx
import { Mosaic, defineComponents } from "@mosaicjs/react";

const components = defineComponents({
  Card: ({ children }) => <section className="card">{children}</section>,
  Text: ({ props, children }) => <p data-tone={props.tone}>{children}</p>,
  Slider: ({ props, value, setValue }) => (
    <input type="range" min={props.min} max={props.max} step={props.step}
      value={Number(value ?? 0)} onChange={(e) => setValue?.(Number(e.target.value))} />
  ),
  Button: ({ children, events }) => <button type="button" onClick={events.click}>{children}</button>,
});

const source = `
<Card state={{ eggs: 12 }}>
  <Slider label="Number of eggs" value={eggs} min={0} max={144} step={1} />
  <Text>Total: {formatCurrency(eggs * 0.50)}</Text>
  {eggs > 60 && <Text tone="warn">Bulk order - wholesale pricing applies.</Text>}
  <Button variant="primary" onClick={order({ eggs: eggs, total: eggs * 0.50 })}>
    Place order
  </Button>
</Card>`;

function Artifact() {
  return (
    <Mosaic
      source={source}
      components={components}
      onIntent={(name, args) => console.log("host intent:", name, args)}
    />
  );
}
```

Drag the slider and the total recomputes locally - `{eggs * 0.50}` compiles to a [bounded expression](expr.md); it is interpreted, not executed.
The warning appears when `eggs > 60` holds.
Only the button crosses to your host: `onIntent` receives `('order', { eggs: 80, total: 40 })` with the **computed** values, and your app decides what to do with them.
Nothing in the artifact can fetch, navigate, or run code ([invariants 1-4](../ARCHITECTURE.md#invariants)).

## `<Mosaic>`

```ts
type MosaicProps = {
  source: string | MosaicDocument;
  components: MosaicComponents; // the host's own components, by block type
  registry?: MosaicRegistry; // host vocabulary; defaults to DEFAULT_REGISTRY
  isStreaming?: boolean; // treat source as a still-arriving prefix
  onIntent?: (name: string, args?: unknown) => void | Promise<void>;
  onDiagnostics?: (diagnostics: ValidationDiagnostic[]) => void; // advisory, once per distinct source
  fallback?: (source: string) => ReactNode; // for source that does not parse at all
  manifest?: HostManifest; // default: DEFAULT_MANIFEST
};
```

Everything a host used to hand-build is the library default:

- **Streaming.** With `isStreaming`, the source is completed to the last well-formed boundary and rendered progressively; until anything is renderable, the raw source shows quietly.
- **Best-effort rendering.** Validation is advisory: diagnostics go to `onDiagnostics` (fired once per distinct source, the feed for a model's self-correction loop) and never blank the artifact.
  Only source that does not parse at all reaches `fallback`.
- **Error boundaries.** A throwing component degrades to its children instead of crashing the tree.
- **The reactive loop.** State lives in one React store; every change re-resolves the artifact.
  Local `state.set`/`state.toggle` mutations apply in place; every other `on:event` action leaves through `onIntent`.

No `eval`, no `Function`, no `dangerouslySetInnerHTML`.

## The host's own components

`components` is how a host owns the entire design without writing a renderer.
Any block type in the map renders through the host's component - it wins over the macro expansion **and** the `decompose` floor - while the library keeps owning the reactive loop.
Blocks without a registered component still degrade safely: a [macro block](custom-blocks.md#expandsto-macro-blocks) renders its expansion, a rich block renders its `decompose` floor, and anything else renders its children in order.

Each component receives `MosaicBlockProps`:

| Field      | What it is                                                             |
| ---------- | ---------------------------------------------------------------------- |
| `node`     | the resolved IR node                                                   |
| `props`    | resolved props - exprs evaluated, then coerced to the block's schema   |
| `children` | rendered child elements, in order                                      |
| `value`    | the bound state value, when the node carries `bind:state`              |
| `setValue` | writes the bound path; present only when `bind:state` is set           |
| `events`   | one ready-to-attach callback per `on:event` entry, keyed by event name |

### Typed components with `defineComponents`

`defineComponents` gives every built-in block name its exact prop type (from the generated `BlockPropTypes`), so `props.variant` on a `Button` is the real union, not a string:

```tsx
import { defineComponents } from "@mosaicjs/react";

const components = defineComponents({
  Button: ({ props, children, events }) => (
    // props: { variant?: "primary" | "secondary" | "subtle" | "danger"; icon?: string; ... }
    <MyButton variant={props.variant ?? "secondary"} onClick={events.click}>{children}</MyButton>
  ),
  Toggle: ({ props, value, setValue }) => (
    <MySwitch label={props.label} checked={value === true} onChange={setValue} />
  ),
});
```

Unknown keys are allowed (custom blocks); they default to the untyped `MosaicBlockProps` shape.

### Coercion

Props are coerced against the block's schema before your component sees them, so shape handling never leaks into host code:

- a number arriving for a `string` prop is stringified;
- an out-of-enum value becomes `undefined` (fall back to your default);
- a wrong-shaped object for a scalar prop becomes `undefined` - raw JSON can never render as text;
- arrays are filtered per element type; undeclared props pass through untouched.

`coerceProps(props, def)` is exported for hosts that need the same guarantee outside the component tree.

## Custom blocks

`defineBlock(schema, component)` binds a [host-defined block](custom-blocks.md) to a component, with `props` typed from the schema via `InferBlockProps`:

```tsx
import { createRegistry } from "@mosaicjs/core";
import { defineBlock, Mosaic } from "@mosaicjs/react";
import { FlightCardSchema } from "./flight-card.shared";

const FlightCard = defineBlock(FlightCardSchema, ({ props, events }) => (
  <Flight airline={props.airline} price={props.price} onClick={events.click} />
));

const registry = createRegistry([FlightCardSchema]);

<Mosaic source={src} registry={registry} components={{ ...components, ...FlightCard.component }} />;
```

The component is optional: a schema with an `expandsTo` macro renders through its expansion when no component is registered.
Interactivity costs a custom block nothing: `bind:state`, `on:event`, `if:show`, and `for:each` are IR directives the runtime handles before the component renders - a component that uses `value`/`setValue` is a bound control, and one that ignores them is display-only.
See [custom blocks](custom-blocks.md) for the schema half and the `bind:state` caveat for custom controls.

## Diagram layout

`layoutDiagram(props)` is an exported, deterministic, dependency-free layered layout for the `Diagram` block - nodes, edges, group hulls, geometry only.
Your `Diagram` component draws whatever it wants (SVG, canvas, a graph library) over that geometry, or ignores the helper entirely.

## The same artifact as text

Every artifact has a text floor.
`@mosaicjs/ansi` renders the identical source as readable terminal output - rich blocks decompose to primitives, controls print their state, and derived values still evaluate:

```ts
import { renderAnsi } from "@mosaicjs/ansi";

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
<Card state={{ eggs: 12 }}>
  …
</Card>
```
````

`<Mosaic source>` and `renderAnsi()` accept the fenced text directly.
To work with the document yourself, use the core:

```ts
import { loadMosaic, saveMosaic, serialize, validate, DEFAULT_MANIFEST } from "@mosaicjs/core";

const doc = loadMosaic(fileText); // throws JsxError on bad input
const result = validate(doc, DEFAULT_MANIFEST);
const json = serialize(doc); // canonical mosaic-json
const file = saveMosaic(doc); // back to a fenced .mosaic file
```

Complete hand-written artifacts - plans, comparisons, pricing estimators, diagrams - live in [`examples/`](../examples), and the [examples README](../examples/README.md) explains how to read them.

From here, the [docs index](README.md) holds the full reference set; [State and events](interactivity.md) and [the `expr` language](expr.md) are where most artifact-writing questions land.
