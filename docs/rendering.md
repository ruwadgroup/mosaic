# Rendering

Mosaic is an open specification, and the renderer contract is the portable part of it: **the IR, the Host Manifest, and `walk()` are the spec; everything drawing pixels is an implementation**.
`@mosaic/react` is the reference library we provide for React - one implementation of the contract, not the contract itself.
A SwiftUI, Compose, Flutter, TUI, email, or Slack renderer implements the same contract against the same IR, and `@mosaic/ansi` exists partly to prove the floor of that claim ([proposal §7.2](proposal.md#72-the-public-api)).

The pipeline every renderer runs:

```text
parse → validate → resolve → walk(visitor) → dispatch
```

The first four stages are pure functions and live in `@mosaic/core`.
Only `dispatch` touches the world: it applies local `state.*` mutations and hands host intents to the host.

## The Host Manifest

A host publishes a manifest - **capabilities and policy, never design** ([proposal §3.3](proposal.md#33-the-host-manifest), [schema](../schema/host-manifest.schema.json)).
The model receives `compactManifest(m)` in its system prompt so it targets the host accurately.

```ts
type HostManifest = {
  mosaic_version: "1.0";
  interactive: boolean; // false = render controls in their default state
  components_supported: string[]; // rich blocks drawn natively; the rest decompose
  directives_supported: string[];
  permissions?: Record<string, "allow" | "deny" | "user-consent">; // e.g. { Embed: 'deny' }
  strict?: boolean; // unknown tags fail validation instead of warning
};
```

No color, spacing, or font value appears here, because token **values** never travel - the artifact carries token names and the renderer maps them ([invariant 6](../ARCHITECTURE.md#invariants)).
`DEFAULT_MANIFEST` is a permissive everything-on manifest useful for development.

## validate

`validate(doc, manifest)` checks the document against the block registry and the manifest, and returns `{ ok: true, doc, warnings }` or `{ ok: false, errors }`.
Diagnostics carry a node path, the node type, a code, and often a `fix` hint:

| Code                    | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `UNKNOWN_TAG`           | not in the registry (a warning unless `strict`)                                  |
| `MISSING_REQUIRED_PROP` | e.g. a visual block without `alt` ([invariant 7](../ARCHITECTURE.md#invariants)) |
| `INVALID_EXPR`          | an expression that does not parse or blows the static cost bound                 |
| `INVALID_STATE_PATH`    | a `bind:state` / `from:state` value that is not a path                           |
| `INVALID_DIRECTIVE`     | unknown directive name or malformed value (`for:each` grammar, …)                |
| `INVALID_DIAGRAM`       | duplicate ids, dangling edge endpoints, dangling group refs                      |
| `UNSUPPORTED_BY_HOST`   | a rich block not in `components_supported` (a warning: it will decompose)        |

The validator-to-model loop is the intended use: feed the diagnostics back and the model repairs the artifact.

## resolve

`resolve(doc, manifest, state?)` evaluates a document against a state scope and returns a plain document again - same shape, no framework types:

- `expr` refs in props and text evaluate to values; `token` refs pass through untouched (mapping them is the renderer's job).
- `if:show` prunes, `for:each` expands with the item and index in scope, `from:expr` / `from:state` / `bind:state` fill control values.
- State paths resolve to concrete paths (`files[i].checked` → `files[2].checked`) so the renderer can close over them.
- Intent args evaluate, so dispatch hands the host computed values.

`initialState(doc)` extracts the root's `state={{…}}` literal.
Re-resolving on every state change is the reactivity model; documents are small enough that this stays simple and correct.

## walk and the NodeVisitor

`walk(doc, visitor, manifest)` is the portable renderer contract - the seam a new stack implements:

```ts
type NodeVisitor<T> = {
  primitive(type: string, props: Record<string, PropValue>, children: T[], node: MosaicNode): T;
  text(value: string): T;
};
```

One resolved node maps to one host-native surface - a React element, a SwiftUI view, an ANSI string.
Before the visitor sees a rich block that is **not** in `components_supported`, `walk` expands its `decomposeTo` recipe into primitives ([invariant 8](../ARCHITECTURE.md#invariants)), so a visitor only ever has to draw what it claims to support.
The registry (`BLOCK_REGISTRY`, `blockSpec(type)`) is exported for renderers that need block metadata.

A minimal renderer is genuinely small: the ANSI renderer is one file that resolves, then maps nodes to lines.
Build order for a new stack: implement `text` and the layout primitives, lean on `decomposeTo` for everything rich, then take over rich blocks one by one by adding them to your manifest.

## `@mosaic/react` - the provided React library

`render(source, opts)` runs the whole pipeline and returns a React element; `<Mosaic source={…} {…opts} />` is the component form.

```ts
type RenderOptions = {
  manifest?: HostManifest; // default: DEFAULT_MANIFEST
  theme?: Theme; // token → value map for the reference blocks
  components?: MosaicComponents; // the host's own components, by block type
  onAction?: (action: string, args?: unknown) => void | Promise<void>;
  format?: "jsx" | "json"; // wire hint; otherwise auto-detected
  strict?: boolean; // overrides manifest.strict
};
```

State lives in one React store; every change re-resolves the artifact.
No `eval`, no `Function`, no `dangerouslySetInnerHTML`.

### The host's own components

`components` is how a host owns the entire design without writing a renderer.
Any block type in the map renders through the host's component - it wins over the reference block **and** over `decomposeTo` - while the library keeps owning the reactive loop:

```tsx
const components: MosaicComponents = {
  Card: ({ props, children }) => <MyCard title={String(props.title ?? "")}>{children}</MyCard>,
  Slider: ({ props, value, setValue }) => <MySlider min={Number(props.min ?? 0)} max={Number(props.max ?? 100)} value={Number(value ?? 0)} onChange={setValue} />,
};
```

Each component receives `MosaicBlockProps`:

| Field      | What it is                                                             |
| ---------- | ---------------------------------------------------------------------- |
| `node`     | the resolved IR node                                                   |
| `props`    | resolved props - exprs evaluated, token refs mapped through the theme  |
| `children` | rendered child elements, in order                                      |
| `value`    | the bound state value, when the node carries `bind:state`              |
| `setValue` | writes the bound path; present when `bind:state` is set                |
| `events`   | one ready-to-attach callback per `on:event` entry, keyed by event name |

### Theme

The reference blocks draw from a `Theme` - a token-to-value map (`color`, `space`, `radius`, `font`, `tone`) resolved via `resolveToken`.
`DEFAULT_THEME` is the built-in dark theme.
A host that supplies its own `components` ignores all of this; the theme exists so the reference blocks are usable out of the box, not to constrain anyone's design.

### Diagram layout

The reference `Diagram` block draws SVG over `layoutDiagram(props)` - an exported, deterministic, dependency-free layered layout (nodes, edges, group hulls, with geometry only).
A host that wants ELK-grade layout registers its own `Diagram` in `components` and can still reuse the helper or ignore it entirely ([spec 0304](../specs/0304-diagram-block.md)).

## `@mosaic/ansi` - the text floor

`renderAnsi(source, opts?)` renders any artifact as readable text: rich blocks decompose, controls print their state (`( ) label`, `[█████░░] 50%`), and expressions evaluate once at render time.
Options: `color` (ANSI codes, off by default so output pipes safely) and `width`.
It exists as the proof that **every** artifact has a floor: whatever surface you are building for, you can always do at least this well.
