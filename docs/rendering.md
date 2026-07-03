# Rendering

Mosaic is an open specification, and the renderer contract is the portable part of it: **the IR, the Host Manifest, and `walk()` are the spec; everything drawing pixels is an implementation**.
The provided libraries are two implementations of the contract, not the contract itself: [`@mosaicjs/react`](react.md) for the web, and `@mosaicjs/ansi` as the text floor.
A SwiftUI, Compose, Flutter, TUI, email, or Slack renderer implements the same contract against the same IR ([proposal §7.2](proposal.md#72-the-public-api)).

The pipeline every renderer runs:

```text
parse → validate → resolve → walk(visitor) → dispatch
```

The first four stages are pure functions and live in `@mosaicjs/core`.
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

No color, spacing, or font value appears here, because style values never travel - the artifact carries semantic props (`tone="warn"`, `variant="label"`) and the renderer maps them ([invariant 6](../ARCHITECTURE.md#invariants)).
`DEFAULT_MANIFEST` is a permissive everything-on manifest useful for development.

## validate

`validate(doc, manifest, { registry? })` checks the document against the block registry and the manifest, and returns `{ ok: true, doc, warnings }` or `{ ok: false, errors }`.
Pass a [host registry](custom-blocks.md) so host-defined blocks validate exactly like built-ins.
Diagnostics carry a node path, the node type, a code, and often a `fix` hint:

| Code                    | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `UNKNOWN_TAG`           | not in the registry (a warning unless `strict`)                                  |
| `MISSING_REQUIRED_PROP` | e.g. a visual block without `alt` ([invariant 7](../ARCHITECTURE.md#invariants)) |
| `INVALID_PROP_VALUE`    | wrong type, out-of-enum value, or wrong element shape for a declared prop        |
| `REMOVED_PROP`          | a presentational prop the format dropped; the `fix` names the replacement        |
| `INVALID_EXPR`          | an expression that does not parse or blows the static cost bound                 |
| `INVALID_STATE_PATH`    | a `bind:state` / `from:state` value that is not a path                           |
| `INVALID_DIRECTIVE`     | unknown directive name or malformed value (`for:each` grammar, …)                |
| `INVALID_DIAGRAM`       | duplicate ids, dangling edge endpoints, dangling group refs                      |
| `UNSUPPORTED_BY_HOST`   | a rich block not in `components_supported` (a warning: it will decompose)        |

The validator-to-model loop is the intended use: feed the diagnostics back and the model repairs the artifact.

## resolve

`resolve(doc, manifest, state?)` evaluates a document against a state scope and returns a plain document again - same shape, no framework types:

- `expr` refs in props and text evaluate to values.
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
Before the visitor sees a rich block that is **not** in `components_supported`, `walk` expands its `decompose` recipe into primitives ([invariant 8](../ARCHITECTURE.md#invariants)), so a visitor only ever has to draw what it claims to support.

## Block precedence

A full renderer resolves each node through the same ladder the provided libraries use:

1. **The host's own component** for the type, when one is registered - the host owns the design.
2. **`expandMacro(node, registry)`** - a [host-defined block](custom-blocks.md) with an `expandsTo` template renders through its expansion, with zero renderer code.
3. **The `decompose` recipe** for rich blocks the surface does not draw natively.
4. **Children in order** for anything else - unknown structure degrades to its content, never to a crash.

The registry (`DEFAULT_REGISTRY`, `describeBlock`, `listBlocks`, and `createRegistry` for host vocabulary) is exported for renderers that need block metadata.

A minimal renderer is genuinely small: the ANSI renderer is one file that resolves, then maps nodes to lines.
Build order for a new stack: implement `text` and the layout primitives, lean on `decompose` for everything rich, then take over rich blocks one by one by adding them to your manifest.

## The provided libraries

- **[`@mosaicjs/react`](react.md)** - the headless React runtime (typed components, coercion, streaming, diagnostics, intents).
  The host brings its own components, and the macro/decompose/children ladder is the floor beneath them.
- **`@mosaicjs/ansi`** - `renderAnsi(source, opts?)` renders any artifact as readable text: rich blocks decompose, controls print their state (`( ) label`, `[█████░░] 50%`), and expressions evaluate once at render time.
  Options: `color` (ANSI codes, off by default so output pipes safely), `width`, and `registry` for host vocabulary.
  It exists as the proof that **every** artifact has a floor: whatever surface you are building for, you can always do at least this well.
