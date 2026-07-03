# Custom blocks and the registry

Mosaic's vocabulary is modular: every built-in block is a `BlockDefinition`, and a host composes the exact vocabulary it wants - all of it, a curated subset, or the defaults plus its own blocks.
One definition drives everything: rendering, validation, and what the model is taught through `ls`/`cat`.
Register a block once and it is discoverable (`mosaic_ls`), describable (`mosaic_cat`), and validatable (`mosaic_validate`) exactly like a built-in.

## `BlockDefinition` - one plain-data shape

```ts
import { defineBlockSchema } from "@mosaicjs/core";

export const FlightCardSchema = defineBlockSchema({
  name: "FlightCard",
  kind: "data",
  doc: "A single flight option with price and times.",
  props: {
    airline: { type: "string", required: true, doc: "Carrier name." },
    price: { type: "string", required: true, doc: "Display price." },
    recommended: { type: "boolean", doc: "Highlight as the best option." },
  },
  example: '<FlightCard airline="ANA" price="$820" recommended />',
  expandsTo: `
    <Card tone={recommended ? 'ok' : null}>
      <Stack direction="horizontal" justify="between" align="center">
        <Text>{airline}</Text>
        <Text variant="label">{price}</Text>
      </Stack>
    </Card>`,
});
```

The fields:

| Field       | What it is                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `name`      | PascalCase tag name, unique within a registry                                                      |
| `kind`      | `layout` \| `content` \| `control` \| `structure` \| `media` \| `data` - the `ls` grouping         |
| `doc`       | one-line description, shown by `ls`                                                                |
| `props`     | prop declarations by name (see `PropSpec` below)                                                   |
| `example`   | a minimal mosaic-jsx example, shown by `cat`; must validate against the registry it registers into |
| `children`  | whether the block renders its children                                                             |
| `rich`      | rich blocks decompose to primitives where unsupported                                              |
| `decompose` | the primitive expansion recipe, `(node) => MosaicNode` - a function, so it does not survive JSON   |
| `expandsTo` | a mosaic-jsx macro template - the serializable way to define a block's rendering (below)           |

Everything except `decompose` is **plain serializable data**.
That is a deliberate design decision: Mosaic's schema is introspection-first.
The same object renders the block, validates artifacts, and prints the model-facing text of `mosaic_cat` - and because it is JSON, a registry crosses any boundary: a web client shares it with a tools server, a config file feeds a renderer, a wire carries it.
This is also why the schema language is not Zod or another validation library: those are closures (not data), have no reflection to print from, and can express far more than the wire format carries.
`PropSpec` is a strict profile of JSON Schema - exactly the set the format can express.

### `PropSpec` - the six-form prop profile

```ts
type PropSpec = {
  type: "string" | "number" | "boolean" | "enum" | "string[]" | "number[]" | "string[][]" | "record[]" | "record" | "json";
  doc: string; // one-line description, shown by cat; required by createRegistry
  required?: boolean;
  values?: readonly string[]; // enum only
  shape?: Record<string, PropSpec>; // record[] and record: element keys
  example?: PropValue; // an illustrative literal, shown by cat
};
```

Directives (`bind:state`, `on:event`, `if:show`, `for:each`) are universal and never declared per block.

### Typed props for free

`defineBlockSchema` is a typed identity helper: it preserves the props literal so `InferBlockProps` computes the exact TypeScript shape - enum `values` become unions, `required` controls optionality, `shape` recurses.
Custom blocks need no code generation:

```ts
import type { InferBlockProps } from "@mosaicjs/core";

type FlightCardProps = InferBlockProps<typeof FlightCardSchema>;
// { airline: string; price: string; recommended?: boolean }
```

The built-in blocks get the same shapes through the generated `BlockPropTypes` map.

## `createRegistry` - composing a vocabulary

```ts
import { createRegistry, defaultBlocks } from "@mosaicjs/core";
import { Card, Stack, Text, Stat } from "@mosaicjs/core/blocks";

const everything = createRegistry(defaultBlocks);
const curated = createRegistry([Card, Stack, Text, Stat]);
const extended = createRegistry([...defaultBlocks, FlightCardSchema]);
```

Every built-in is exported individually from `@mosaicjs/core/blocks`, so a curated vocabulary is a plain import list.
A subset registry must be self-contained: every block a member's `example` references must be in the registry too (`Button`'s example uses `Stack`).

`createRegistry` is **fail-fast** - a registry that constructs is a registry the model can trust:

- names must be PascalCase and unique, and must not redefine a built-in;
- every prop must carry a non-empty `doc` (it is the `cat` output);
- every `example` must parse **and** validate against the merged registry;
- an `expandsTo` template must parse, and its expressions may reference only declared prop names plus `children`.

The result is a `MosaicRegistry` - `{ blocks, get(name), has(name), toJSON() }` - the single object accepted everywhere:

```ts
validate(doc, manifest, { registry });
listBlocks(registry); // entries carry host: true for non-built-ins
describeBlock("FlightCard", registry);
```

`toJSON()` emits plain data and `createRegistry` accepts it back, so a registry round-trips across processes.
The one lossy field is `decompose` (a function); blocks defined with `expandsTo` round-trip completely, which is one more reason macros are the preferred form for host blocks.

## `expandsTo` - macro blocks

`expandsTo` implements host macros ([proposal §4.4](proposal.md#44-host-macros)): the template is evaluated with the block's resolved props as the expression scope, and a `{children}` text slot passes children through.
The full expression language works inside it - conditionals, template literals, `.map` - because the expansion runs through the same bounded evaluator as any artifact.

The payoff is the renderer precedence ladder ([rendering](rendering.md#block-precedence)):

1. the host's registered component,
2. `expandMacro(node, registry)` - the macro expansion,
3. the `decompose` floor,
4. children in order.

A macro-only block therefore renders correctly in **every** renderer with zero code written for any of them - the expansion is ordinary primitives, so the host's existing components draw it in React, `@mosaicjs/ansi` prints it, and a future SwiftUI renderer would too.
Defining a useful block requires no component at all; the component is the escape hatch for full custom rendering, not the entry fee.

Renderers call the expansion through `expandMacro`:

```ts
import { expandMacro } from "@mosaicjs/core";

const expanded = expandMacro(resolvedNode, registry); // MosaicNode, or null when the type has no expandsTo
```

## Bindings

A renderer may let the host attach its own native component to a registered block; the component then wins the [precedence ladder](rendering.md#block-precedence) over the macro expansion.
Bindings are an implementation concern and live with each renderer - the React binding is documented in [the React library](react.md#custom-blocks).

One language-level caveat applies to every binding: the compiler's `value={path}` / `checked={path}` sugar lowers to `bind:state` for built-in controls only.
A custom control binds through an explicit `bind:state` directive, not the sugar.

## Teaching the model your blocks

Pass the same registry to the [AI tools](mcp.md) and the model discovers your vocabulary the same way it discovers the built-ins:

```ts
import { mosaicToolDescriptors } from "@mosaicjs/ai";

const tools = mosaicToolDescriptors(registry);
// mosaic_ls now lists "FlightCard (host) - A single flight option with price and times."
// mosaic_cat FlightCard prints the props table and the example
// mosaic_validate accepts FlightCard and catches a missing required airline
```

`mosaic_ls` marks host blocks `(host)` so the model knows they exist only on this host.
On a host without the block, the unknown tag renders its children in order and `validate` flags it, so the model can recompose from primitives - cross-host portability of custom blocks is deliberately out of scope.
