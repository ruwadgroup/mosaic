# The language and the IR

Mosaic moves two forms of the same artifact, with a one-way compiler between them ([proposal §5](proposal.md#5-the-language-and-the-ir), [invariant 5](../ARCHITECTURE.md#invariants)).

- **mosaic-jsx** is what the model writes - a strict JSX pattern that cannot express code.
- **mosaic-json** is the IR's canonical JSON serialization - what validators check, storage diffs, and MCP tools return.

Nobody hand-authors the JSON, and nothing decompiles it back to authored source; `Mosaic -> IR` is the only direction.
This page is the wire reference for both forms and for the fence that carries them.

## The fence

A `.mosaic` file (and an artifact inline in a model reply) is a fenced block:

````text
```mosaic v=1 id=q3-plan
<Stack gap="4">
  …
</Stack>
```
````

The opener is ` ```mosaic v=MAJOR id=IDENT `.
`id` is the artifact's **stable identity across regenerations**: when the model emits a new version of the same artifact it reuses the id, and the host replaces the old tree.
Ids match `^[a-z0-9][a-z0-9._-]{2,63}$`.

`parse()` accepts fenced or bare source, and auto-detects the form: a body starting with `{` parses as mosaic-json, anything else as mosaic-jsx.

## mosaic-jsx

The grammar is deliberately small.
Everything a model might reflexively write that smells like JavaScript is rejected at compile time, with a positioned error - this is the compile-time safety guarantee ([invariant 1](../ARCHITECTURE.md#invariants)).

### Tags

- PascalCase only: `<Card>`, `<DataTable>`.
  A lowercase tag (`<div>`) fails with `LOWERCASE_TAG` - Mosaic is not HTML.
- Self-closing is permitted and cheaper: `<Divider />`.
- One root element per artifact; content after it fails with `TRAILING_CONTENT`.

### Attributes

Three value forms:

```jsx
<Input label="Seats" />          // string
<Slider max={144} />             // brace literal
<Toggle disabled />              // bare name = true
```

`class`, `className`, and `style` are rejected with `FORBIDDEN_ATTRIBUTE`: styling comes from the host, never the artifact ([invariant 6](../ARCHITECTURE.md#invariants)).

An attribute whose name is a [directive](interactivity.md) (`bind:state`, `for:each`, `on:event`, …) lands in the node's `directives`, everything else in `props`.

### Braces

Braces admit **JSON-compatible literals plus exactly two interpreted calls** - nothing else:

```jsx
<Chart series={[{ points: [["Mon", 4], ["Tue", 7]] }]} />   // arrays, objects, numbers, strings, booleans, null
<Text color={token("color.accent")} />                       // a theme-token reference
<Stat value={expr("seats * 16")} />                          // a bounded expression
```

`token("…")` and `expr("…")` each take one string literal and compile to the wire forms `{ "$token": "…" }` and `{ "$expr": "…" }`.
Both are interpreted downstream; neither is executed as code.

Rejected, each with a positioned `CODE_IN_BRACES` error:

- identifiers: `{eggs * 2}` - write `expr("eggs * 2")`
- arrow functions: `{(x) => x}`
- template literals: `` {`total: ${n}`} ``
- spread of identifiers: `{...props}`
- method calls anywhere, including inside object literals

Object keys may be bare identifiers or quoted strings.
`/* … */` comments are allowed inside brace literals (a multiline array with notes) and are discarded.

### Children

- Text runs collapse whitespace to single spaces; pure-whitespace runs between elements vanish.
- `{expr("…")}` and `{"literal"}` are valid children; each becomes a text node.
  Anything else in a brace child fails with `INVALID_CHILD`.
- `{/* … */}` comments are discarded.

### Compile errors

The compiler throws `JsxError`, carrying one or more `{ line, column, message, code }` records.
The codes:

| Code                                                                                                             | Meaning                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `LOWERCASE_TAG`                                                                                                  | HTML tag; blocks are PascalCase                             |
| `FORBIDDEN_ATTRIBUTE`                                                                                            | `class` / `className` / `style`                             |
| `CODE_IN_BRACES`                                                                                                 | identifier, arrow, template literal, or spread in braces    |
| `INVALID_LITERAL`                                                                                                | malformed brace literal (bad number, missing `:` or `,`, …) |
| `INVALID_CHILD`                                                                                                  | a brace child that is not text or `expr(...)`               |
| `INVALID_DIRECTIVE`                                                                                              | a directive value of the wrong shape                        |
| `MISMATCHED_TAG` / `UNTERMINATED_TAG`                                                                            | close-tag errors                                            |
| `UNTERMINATED_STRING` / `UNTERMINATED_COMMENT` / `INVALID_ESCAPE`                                                | string and comment errors                                   |
| `EXPECTED_ELEMENT` / `EXPECTED_TAG` / `EXPECTED_ATTRIBUTE` / `EXPECTED_VALUE` / `EXPECTED_GT` / `EXPECTED_BRACE` | structural expectations                                     |
| `TRAILING_CONTENT`                                                                                               | content after the root element                              |
| `INVALID_DOCUMENT` / `INVALID_JSON`                                                                              | mosaic-json that is not a document / not JSON               |

## The IR

The IR is one node type - the format's identity, and the contract every renderer targets.

```ts
type MosaicNode = {
  kind?: "primitive" | "component" | "text";
  type: string; // PascalCase block name, or '#text'
  props?: Record<string, PropValue>;
  directives?: Directives;
  children?: MosaicNode[];
  slots?: Record<string, MosaicNode[]>; // named child collections
  key?: string; // stable identity for list diffing
};

type MosaicDocument = {
  mosaic_version: "1.0";
  id: string;
  root: MosaicNode;
  refs?: Record<string, MosaicNode>; // hoisted subtrees, inlined via from:ref
};
```

A `PropValue` is any JSON value that may embed `{ $expr: "…" }` and `{ $token: "…" }` refs.
Text is a node too: `type: '#text'` with the string (or an `$expr` ref) in `props.value`.

What each optional field is for:

- **`kind`** is a convenience discriminator so tooling can classify a node without a registry lookup; when omitted, it resolves from the registry by `type`.
- **`key`** gives a repeating child a stable identity, so renderers and diff tooling match items across regenerations by identity rather than position.
- **`slots`** and **`refs`** are reserved: named child regions beyond positional `children`, and hoisted subtrees inlined via `from:ref`.
  Their wire shape is fixed by the schema, but no shipped renderer consumes them yet; their semantics land with their specs.

The normative schema is [`schema/mosaic-v1.schema.json`](../schema/mosaic-v1.schema.json).

## Canonical serialization

The IR serializes two ways, both canonical - which is what makes artifacts diffable across regenerations ([invariant 9](../ARCHITECTURE.md#invariants)).

**mosaic-json** (`serialize(doc)` or `toCanonicalJson`): compact JSON with a fixed key order - `mosaic_version, id, root, refs` on the document, `kind, type, props, directives, children, slots, key` on every node - and all other object keys (props, directives, slots, refs) sorted alphabetically.
Two documents with equal content serialize byte-identically.

**mosaic-jsx** (`serialize(doc, { format: 'jsx' })` or `toJsxSource`): one tag per line, two-space indentation, props before directives, `name` shorthand for `true`, self-closing leaves.
`saveMosaic(doc)` wraps that in the fence.

Loading is symmetric: `loadMosaic(text)` accepts a fenced file, bare mosaic-jsx, or mosaic-json, and throws `JsxError` on anything else.

## Why two forms

The two forms are optimized separately and never traded off ([proposal §5.3](proposal.md#53-compilation-one-direction)).
mosaic-jsx is for the model: positional children and bare attribute names avoid the per-node `type`/`props`/`children` key tax, and JSX fluency comes free with training data.
mosaic-json is for machines: deterministic, schema-validatable, diff-stable.
The model never pays the JSON's token tax, and tooling never parses JSX.

The split is a hard boundary, not a preference: **the model never touches the IR, in either direction**.
It does not emit mosaic-json, and nothing model-facing - system prompts, [skills](../skills/README.md), or tool results echoed into context - should carry it.
When an artifact must re-enter the model (to revise or regenerate), hand it the pattern: `serialize(doc, { format: 'jsx' })`.
The IR exists between machines - compiler to validator to renderer to transport - and stops there.
