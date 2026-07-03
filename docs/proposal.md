# Mosaic

### AI thoughts, made visible

_An agent thinks; Mosaic turns that into an interface you can see and touch - general building
blocks (the tiles) and a safe expression language, not a gallery of templates, so an agent composes
anything, inside your app's look, with no code to run._

**Technical proposal**

> **Status: founding proposal.**
> This document defines Mosaic: the JSX language, the IR it compiles to, the building-block
> vocabulary, the reactive expression model, the Host Manifest, the renderer contract, the MCP
> delivery model, the public API, and the security guarantees.
> The docs and the implementation cite this document by section number; the numbering is kept stable
> so citations hold.
> It is re-cut only on a vision-level shift.
> Staging lives in the [roadmap](../ROADMAP.md), not here: _order, not scope._

---

> **0.7 amendment (breaking).**
> This proposal is not re-cut; the numbering stands.
> Format 0.7 sharpens the semantic line: presentational props (`gap`, `pad`, `Text size`/`weight`/`caps`, `Icon size`, `Button size`, `Stack wrap`, `Tabs variant`) and `token(...)` refs are removed - the host owns spacing, typography, density, and chrome.
> `Text` gains `variant="body|label|caption"` and `Button` gains `variant="primary|secondary|subtle|danger"` (inline emphasis moves to Markdown).
> The block vocabulary is modular: every block is a `BlockDefinition`, hosts compose a registry with `createRegistry`, and custom blocks come from `defineBlockSchema` (with an optional `expandsTo` macro template).
> Delivery is multi-provider: the new `@mosaicjs/ai` carries neutral tool descriptors plus `/vercel`, `/mcp`, and `/prompt` adapters, and `@mosaicjs/react` is fully headless (`onIntent` replaces `onAction`; the host's components draw every block).
> The delivery model is also simplified: the artifact travels as a ` ```mosaic ` fence in the model's reply, MCP carries only the three introspection tools (`mosaic_ls`, `mosaic_cat`, `mosaic_validate`), and the `ui://` resource and MCP-Apps HTML bridge of §7.1 are retired.
> 0.8 extends local mutations: `set(path, value)` accepts any bounded expression, evaluated against current state at event time (counters and calculators work), and local mutations are canonical action records (`{ action: "state.set", args: { path, value } }`) in the IR - the string forms are gone.
> The sections below read against the current vocabulary except where a removed prop appears in an illustrative snippet.

---

## 0. One-paragraph summary

Mosaic is a format for the interfaces an AI agent produces, meant for the **builders of AI apps**
(Claude Code, Codex, Cursor, and the like).
The agent writes **Mosaic**, a JSX pattern that compiles to a canonical **IR** composed from a set
of **general building blocks** - layout, content, controls, and data/viz.
Because the blocks are general, an agent composes whatever interface it needs.
Interactivity is **local and reactive**: a bounded expression language lets a control drive derived
values (a slider of eggs updates a total price) on the client, and any action beyond local state is
handed to the host as a named intent.
Every component is rendered by the host's own renderer, so the entire design is the host's; the
agent writes only the standard vocabulary - components and semantic tokens like `tone="warn"` - and
the host decides what each one looks like.
Everything the agent emits is data, so the host stays in control of what runs.
Mosaic is delivered inline - a fenced artifact in the model's reply that the host's message renderer
draws natively - and the model gets the schema right up front through three introspection tools
(`mosaic_ls`, `mosaic_cat`, `mosaic_validate`) delivered over MCP or any tools API.

---

## 1. Motivation

Much of what an agent produces is spatial, not linear: a plan with milestones and risks, a
comparison across options, a dashboard, a calculator, a table you can filter.
A person takes that in faster as a picture than as paragraphs describing it.
So an agent benefits from a way to hand its host a real interface - one the host renders in its own
look, that a person can read and act on directly.

Mosaic is that format.
The rest of this section names what such a format needs; the sections after it are the design.

### 1.1 What the format needs

1. **Composability** - general building blocks an agent assembles into any interface.
2. **Local interactivity** - controls, derived values, conditionals, and lists, expressed
   declaratively and evaluated on the client.
3. **Safety** - Mosaic carries data, and the expression language is bounded and provably
   terminating, so the host stays in control of what runs.
4. **Host-owned design** - the host renders every component itself; the agent writes semantic tokens
   (`tone="warn"`), never raw styles, so the entire look is the host's.
5. **Token efficiency** - a language the model emits cheaply and fluently.
6. **Diffable and streamable** - a canonical IR serialization for clean diffs; partial trees render
   incrementally.
7. **Portable delivery** - one artifact reaches any host, over a transport that already exists.

---

## 2. What Mosaic looks like

Two concrete interfaces, before the design details.

### 2.1 A plan, composed from building blocks

```mosaic v=1 id=q3-plan
<Stack>
  <Heading>Q3 launch plan</Heading>
  <Timeline items={[
    {date:"2026-07-08", title:"Spec freeze",  tone:"ok"},
    {date:"2026-07-22", title:"Beta cohort",  tone:"warn"},
    {date:"2026-08-12", title:"GA",           tone:"ok"}
  ]} />
  <DataTable
    columns={["Risk", "Likelihood", "Impact", "Mitigation"]}
    rows={[
      ["Migration drift", "med", "high", "Snapshot before cutover"],
      ["Auth rate limit",  "low", "med",  "Cache + back-off"]
    ]} />
</Stack>
```

There is no `<Plan>` tag.
A plan is a `Stack` of a `Timeline` and a `DataTable` - general components, assembled.
No hex colors: `tone="warn"` is a semantic token, and the host's renderer decides what it looks
like.
Tabular data rides in prop-arrays (`rows={[...]}`), which is both token-cheap and how the model
already writes tables.
A host that emits plans constantly can register a `Plan` **macro** ([§4.4](#44-host-macros)) that
expands to exactly this - but that lives in the host, not in Mosaic.

### 2.2 An interface with real interaction

```jsx
<Card>
  <Slider label="Number of eggs" bind:state="eggs" min={0} max={144} step={1} />
  <Text>Total: {expr("formatCurrency(eggs * 0.50)")}</Text>
  <Text if:show="eggs > 60" tone="warn">Bulk order - wholesale pricing applies.</Text>
  <Button on:event={{ click: { action: "order", args: { eggs: expr("eggs"), total: expr("eggs * 0.50") } } }}>
    Place order
  </Button>
</Card>
```

Dragging the slider writes `eggs`.
The total is a **derived value** - `expr("eggs * 0.50")` recomputes locally, with no code and no
round-trip.
The warning shows itself when a condition holds.
Only "Place order" crosses to the host, handing it a named intent carrying the _computed_ total.
Together, general controls and a safe expression language cover any local interaction - a
calculator, a filter, a multi-step form - drawn entirely by the host's own components.
Complete `.mosaic` files - a composed plan, an interactive calculator, a chart-heavy dashboard, a
filterable table, a kanban board - live in [`examples/`](../examples).

---

## 3. Architecture

### 3.1 Three layers

- **Layer 1 - Mosaic, the language.**
  A JSX pattern - fluent, token-cheap, code-free by construction
  ([§5](#5-the-language-and-the-ir)).
  It is the one surface the model writes to.
- **Layer 2 - the IR.**
  Mosaic compiles to a single canonical typed tree, a `Node` record with deterministic key ordering,
  modeled on Pandoc's `reader -> IR -> writer` pipeline.
  The IR is the format's identity and the contract every renderer targets; it serializes losslessly
  to and from JSON for storage, tooling, and MCP delivery.
- **Layer 3 - frameworks.**
  A framework consumes the IR and renders every component with the host's own implementation - one
  host-native output, mapping semantic tokens to the host's design along the way.
  `mosaic-react` is the reference we ship; builders write their own for other stacks against the
  same `walk()` contract ([§7](#7-delivery--integration)).

### 3.2 The pipeline

```text
compile   → validate → resolve → render → dispatch
(Mosaic     (registry ×  (expr       (host     (local state.* / expr;
 -> IR)      manifest)    eval)       VDOM)     host intents to the host)
```

The first four stages are pure functions of their input.
Only `dispatch` reaches outside the artifact: it applies local state mutations and
derived-expression updates, and hands `on:event` host intents to the host under its policy.

### 3.3 The Host Manifest

Every host that renders Mosaic publishes a manifest; the model receives a compressed form in its
system prompt so it targets the host accurately.
It declares **capabilities and policy, never design** - the host's renderer draws every component,
so no color, spacing, or font value ever travels:

```jsonc
{
  "mosaic_version": "1.0",
  "interactive": true,
  "components_supported": ["DataTable", "Chart", "Tree", "Board", "Timeline", "Stat"],
  "directives_supported": ["bind:state", "from:state", "from:expr", "if:show", "for:each", "on:event", "slot:name", "key"],
  "permissions": { "Embed": "deny" }
}
```

The semantic tokens the agent writes (`tone="warn"`, `variant="label"`) are standardized by Mosaic
itself, so they never appear in the manifest either.
The host's renderer maps each name to its own design system however it likes; the reference renderer
accepts a token-to-value map as render-time configuration ([§7.2](#72-the-public-api)).
Nothing in the artifact or the manifest hardcodes a value, and the format carries no spacing, size,
or typography knobs - the host owns density, type, and chrome.
`components_supported` lists the rich components the renderer draws natively; anything else falls
back through `decompose` ([§4.3](#43-data--viz-components)).

### 3.4 The trust boundary

The boundary sits between the **model + artifact** (untrusted) and the **host** (trusted).
Three properties hold by construction:

1. **Mosaic cannot express executable code.** Braces admit only JSON literals plus the interpreted
   `expr(...)`; it is interpreted, never executed as code
   ([§8](#8-security)).
2. **Every action is the host's.** An `on:event` hands the host a named intent; the artifact cannot
   reach the network, call a tool, or navigate on its own.
3. **No live data-pull.** An artifact's data is baked in when the model produces it; nothing
   subscribes or re-fetches.

This eliminates the iframe sandbox on the common path - there is nothing executable to sandbox.
The one exception is `<Embed src="...">`, gated by host consent and denied by default.
These are [invariants 1-4](../ARCHITECTURE.md#invariants).

---

## 4. The building blocks

Mosaic ships **general building blocks**, never domain templates.
Every mature UI vocabulary - HTML, Adaptive Cards, A2UI, SwiftUI, shadcn, Radix, and real product
libraries - is a catalog of general primitives and ships zero domain artifacts.
`RiskTable` is a `DataTable` with three columns; an incident report is a `Timeline` plus a `Stat`
plus a `DataTable`.
Those are _content_, not vocabulary; they belong in what the agent composes, not in the registry.

### 4.1 The block catalog

An Mosaic artifact is **embedded content inside a host, not a standalone app**.
So the catalog is the blocks that make up a rich, interactive _view_ - and it deliberately excludes
app-shell chrome, which is the host's job (see below).
None is domain-specific: the set is broad enough that an agent rarely hand-composes a common
affordance, but every block is a general shape, never a `RiskTable` or an `Incident`.

**Layout.** `Box`, `Stack`, `Grid` (12-column with named areas - the bespoke-layout workhorse),
`Divider`.

**Content.** `Text`, `Heading`, `Markdown` (sanitized prose), `Image`, `Icon`, `Link`, `Badge`,
`Tag`, `Avatar` (+ group), `Code`, `Callout` (inline info/warn/error), `Card` (a themed surface).

**Controls.** `Button`, `Input` (text/number/email/password/textarea/search via `type`), `Select`,
`MultiSelect` (array-valued over a fixed option set), `Autocomplete` (type-ahead over baked-in
options; filtering is local), `Checkbox`, `Radio`, `Toggle`, `Slider` (+ range), `DatePicker`,
`ColorPicker`, `FilePicker`, `Rating`, `TagInput`, `Field` (label + control + help + error),
`Disclosure`, `Accordion`.

**Structure & status.** `Tabs` (with `active` as the default tab), `Steps`, `SegmentedControl`,
`Progress`, `Empty` (empty-state).

**Media.** `Video`, `Audio`, `Carousel`.

Every visual block (`Image`, `Video`, and the charts in [§4.3](#43-data--viz-components))
**requires `alt`** ([invariant 7](../ARCHITECTURE.md#invariants)); validation fails without it.
Full prop tables: [`schema/primitives.schema.json`](../schema/primitives.schema.json).

**Not in Mosaic - the host owns these.** Modals, drawers, popovers, tooltips, dropdown menus,
command palettes, toasts, breadcrumbs, pagination chrome, and global navigation are app-shell, not
artifact content.
An artifact that needs detail-on-demand uses `Disclosure`/`Accordion` (inline), and an action that
would open a modal is an `on:event` intent the host handles in its own chrome.
There are no loading states (`Spinner`, `Skeleton`) because an artifact's data is baked in - there
is nothing to wait for.

### 4.2 Composition, not templates

The expressive power lives in free composition - the same way a real design system gives you `div` +
flex + grid + a component library, not a fixed set of page layouts.
An agent invents the layout by nesting `Box`/`Stack`/`Grid`/`Card`, and because every dimension it
can set (`gap`, `pad`, `cols`, `tone`, `radius`) is a **semantic token** rather than a raw value,
the layout is unlimited but the styling is fixed to the host's look.
Layout freedom with zero styling freedom is the guarantee HTML cannot give.

### 4.3 Data & viz components

The reusable rich widgets, each with an open, domain-neutral schema and a normative `decompose`
fallback so it still renders where the renderer can't draw it (a `Chart` degrades to its `alt`; a
`DataTable` to a plain table).

| Component   | Shape                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `DataTable` | Sortable / filterable / paginated columns + rows; data in prop-arrays                                           |
| `List`      | Itemized / virtualizable list with a row template (covers key-value, feeds)                                     |
| `Tree`      | General hierarchy - file trees, org charts, module maps                                                         |
| `Board`     | Columns of cards with optional `sortable` - kanban, triage, pipelines                                           |
| `Timeline`  | Ordered dated/sequenced items, `{date, title, description?, tone?}` - incident histories, roadmaps              |
| `Calendar`  | Month/week/day grid of dated items and events                                                                   |
| `Stat`      | Big number + label + delta + optional trend                                                                     |
| `Chart`     | One chart, `type="line \| area \| bar \| donut \| radar \| gauge \| scatter \| heatmap \| sankey \| sparkline"` |
| `VegaChart` | A full Vega-Lite spec for anything the semantic set doesn't cover - a grammar, not a fixed set; spec is data    |
| `Diagram`   | Declarative nodes / edges / groups; renderer-owned layout; selection binds to state                             |
| `Canvas`    | Inline sanitized SVG - the bespoke escape hatch for what `Diagram` / `Chart` / `VegaChart` cannot express       |
| `Embed`     | The gated iframe escape hatch, denied by default                                                                |

Between `Chart`, `VegaChart`'s grammar, `Diagram`'s declarative graphs, and `Canvas`'s raw SVG, an
agent can express any visualization at all.

### 4.4 Host macros

Recurring whole-interface shapes (`Plan`, `Incident`, a `Dashboard`) are **host-registered macros**,
not Mosaic vocabulary.
A host registers a name and a primitive-subtree template; the macro expands to building blocks
_before_ validation, so the rest of the pipeline never sees a special type.
This is the shadcn distribution model: Mosaic owns the grammar, the host owns its idioms.
Core Mosaic ships no macros - only the mechanism - so the vocabulary stays general and an
off-the-shelf renderer never has to know a builder's domain shapes.

---

## 5. The language and the IR

### 5.1 Mosaic (what the model emits)

The model writes **Mosaic**, a strict JSX pattern, because for UI component trees a JSX subset is
both the most token-efficient and the most fluent target a frontier model has: positional children
and bare attribute names avoid the per-node `type`/`props`/`children` key tax that a JSON tree pays
on every node, and React's dominance in training data makes JSX emission highly reliable.

- **Tags.** PascalCase only; lowercase HTML tags rejected at compile time. Self-closing permitted
  (and cheaper).
- **Attributes.** `name="..."` or `name={literal}`. No `class`, `style`, or `className`.
- **Braces.** Only JSON-compatible literals plus the whitelisted `expr("eggs * 0.5")` call.
  Arrow functions, identifiers, member access, template literals, and `new`
  are rejected. This is the compile-time safety guarantee ([invariant
  1](../ARCHITECTURE.md#invariants)).
- **Children.** Positional; whitespace insignificant; text children become `text` nodes.
- **Comments.** `{/* ... */}` permitted and discarded. **Spread.** `{...obj}` at attribute position
  only, JSON literals only.

The one real risk is _subset leakage_ - a model reflexively emitting `{eggs * 2}`, `.map(...)`, or
`className`.
It is closed **mechanically**, not by prompt prohibition: CFG-constrained decoding (a JSX subset is
a context-free grammar, constrainable by XGrammar / llama.cpp / Guidance / Outlines to ~100%
validity) where the host controls the decoder, and the compile-time validator everywhere as the
backstop.

### 5.2 The IR (canonical) and its serialization

The IR is the canonical typed tree Mosaic compiles to, one-to-one with the node model in
[§4](#4-the-building-blocks).
Its JSON serialization is what the validator checks, what storage and diff tooling consume, and what
an MCP tool returns; nobody emits it token-by-token, so its per-node key tax is free.
The IR is machine-to-machine and the model never touches it in either direction: everything
model-facing - the system prompt, an attached skill, a tool result echoed into context - carries
Mosaic, and a host that needs an artifact back in front of the model hands it the mosaic-jsx form.
A compiled artifact is exactly this - the IR serialized as canonical JSON, carrying `mosaic_version`
for migration-on-load:

```jsonc
{
  "mosaic_version": "1.0",
  "id": "q3-plan",
  "root": { "type": "Stack", "props": { "gap": "4" }, "children": [ /* ... */ ] }
}
```

The `.mosaic` files in [`examples/`](../examples) are **Mosaic source** - what the model writes; the
IR is what they compile to.

### 5.3 Compilation, one direction

Compilation is total and one-way: `Mosaic -> IR`.
The model pays JSX's low token cost; everything downstream - validation, structural diff, universal
parsing, and every renderer - works against the IR and its JSON serialization.
The two jobs are optimized separately and never traded off: the language is what a model writes, the
IR is what a framework builds on, and nobody hand-authors the IR.
The IR's JSON serialization is **canonical** - fixed key order, alphabetical props, compact
literals - which, with stable `key`s and the fenced `id`, is what makes Mosaic artifacts diffable
across regenerations ([invariant 9](../ARCHITECTURE.md#invariants)).

---

## 6. Interactivity

Interactivity is **local and reactive**.
An artifact never pulls from a tool or resource on its own; its data is baked in.
What it has is a client-side reactive loop that needs no round-trip.

### 6.1 State, derived values, conditionals, lists

- **State.** `bind:state="eggs"` two-way binds a control; `from:state="eggs"` reads.
  Both take a **state path**, not just a flat key - `ident (. ident | [ expr ])*` - so
  `bind:state="filters.region"` and `bind:state="files[i].checked"` are well-formed.
  `[expr]` index segments are evaluated once, at resolve time, against the current scope (including
  `for:each` loop variables), yielding the concrete path a renderer reads and writes.
  Reads follow `expr` member/index semantics (a missing segment yields `null`); writes never invent
  structure - a write through a missing or mismatched container is a no-op with a dev warning, since
  the authored `state={{...}}` is the schema.
- **Derived values.** `from:expr="eggs * 0.5"`, or `{expr("...")}` inline in any prop, computes a
  value that recomputes whenever its inputs change. This is the egg-slider's total.
- **Conditionals.** `if:show="eggs > 60"` renders a subtree only when the expression holds.
- **Lists.** `for:each="filter(rows, r, r.price > minPrice) as row"` instantiates a subtree per item
  over a baked-in array, with the item bound in scope.
  An optional second binding names the zero-based index - `for:each="files as f, i"` - in the same
  per-iteration scope as the item, which is what makes per-row binds like
  `bind:state="files[i].checked"` work.

These are declarative directives; all computation is confined to `expr(...)`.

### 6.2 The `expr` expression language

`expr("…")` carries a bounded, pure expression language - CEL-class: **linear-time, terminating,
side-effect-free, and provably not Turing-complete**.
It is **AST-interpreted, never compiled to a function**, so it is CSP-safe by construction.

- **Allowed:** arithmetic `+ - * / %`, comparison, logical `&& || !` (short-circuit), ternary `? :`,
  `in`, indexing `[]`, list literals `[a, b]`, dotted access; a whitelisted function catalog (math: `abs min max round floor
  ceil clamp`; string: `len lower upper trim concat substr replace split join contains`; format:
  `formatCurrency formatNumber toFixed`; bounded array folds over materialized state arrays: `map
  filter reduce sum count any all sort slice`; `has coalesce`).
- **Forbidden forever:** assignment, user-defined functions, **recursion** (the one ingredient -
  Excel's `LAMBDA` - that flips a safe formula language Turing-complete), loops, `new`, method calls
  on nested properties, and all I/O.
- **Bounded:** a static parse-time cost estimate rejects expensive expressions, a runtime step
  budget is the backstop, and the derived-value dependency graph is a DAG - circular references are
  rejected at validation, exactly as a spreadsheet rejects circular references.

The closest prior art is Google A2UI (declarative data + local binding + function calls); Mosaic
differs by specifying a precise, CEL-grounded catalog A2UI leaves vague.

### 6.3 Events

`on:event` fires an action on an event, and it is one of two things:

- **A local mutation** - `set(eggs, value)` / `toggle(open)` - which Mosaic applies
  to its own store; dependent derived values and `if:show` re-evaluate; no round-trip.
  Both accept the same state paths as `bind:state` ([§6.1](#61-state-derived-values-conditionals-lists)):
  `set(data.view, 'grid')`, `set(count, count + 1)`, `toggle(files[2].checked)`.
- **A named host intent** - `{ action: "order", args: {...} }` - which Mosaic hands to the host and
  stops. The host decides what to do (call a tool, ask the model, navigate) under its own policy.

Intent payloads may contain `expr(...)` values, so the host receives the _computed_ result (the
total), not just raw state.
Only `state.*` and host intents cross a boundary, and only a host intent leaves the artifact.

---

## 7. Delivery & integration

Mosaic's core is transport-independent: the IR and `render()` work with no MCP at all.
A first-party app whose agent and renderer live together just calls `render(source)` inline
([§7.2](#72-the-public-api)).
What needs delivering is not a rendering but two texts: the artifact itself, and the schema
knowledge that lets the model write it correctly.

### 7.1 Delivery

The artifact travels **inline in the model's reply** - a ` ```mosaic ` fence in the ordinary
message stream:

````text
```mosaic v=1 id=q3-plan
<Stack>…</Stack>
```
````

The host's message renderer detects the fence and renders it natively - the same seam where it
already special-cases code blocks - streaming the prefix progressively as tokens arrive.
The fence `id` is stable across regenerations, so a new version of an artifact replaces the
rendered tree instead of appending a second copy.
Nothing renders over a transport, and no resource protocol is involved: the artifact is text until
the host's renderer draws it.

The schema knowledge travels as **three introspection tools** - `mosaic_ls`, `mosaic_cat`,
`mosaic_validate` (`@mosaicjs/ai`) - over MCP or any provider's tools API,
plus the agent skill (or a generated system prompt) that teaches emission.
MCP's role in Mosaic is exactly those tools: it carries introspection, never renderings.

### 7.2 The public API

A host integrates Mosaic through one function.

```ts
render(
  source: string | MosaicDocument,          // inline Mosaic source, or a compiled IR
  opts: {
    manifest: HostManifest;
    onIntent: (name: string, args?: unknown) => void;
    components?: MosaicComponents;          // the host's own block components, by type
  }
): React.ReactElement
```

`components` is how a React host owns the entire design without writing a renderer: any block
found in the map draws through the host's component (which receives resolved props, rendered
children, the bound state value with its setter, and ready-made event callbacks), while the
renderer keeps owning the reactive loop.
Blocks not in the map fall back to the reference implementations.

`render()` is `parse → validate → resolve → walk(reactVisitor)`.
A non-React host does not call `render()`; it calls the framework-agnostic core:

```ts
parse(source): MosaicDocument
walk(doc, visitor, manifest): T     // the portable contract every renderer implements
```

`walk` maps one resolved node to one host-native surface (a SwiftUI view, an ANSI string), applying
`decompose` for unsupported components before the visitor sees them.
`mosaic-react`'s `render()` is the worked example; a new surface writes only a `NodeVisitor`.
A `.mosaic` file is loaded with `parse` and rendered with the same `render()` - the MCP resource
text and the file bytes are the same thing.

### 7.3 Integrating into a host (a worked example)

The seam is the host's message renderer.
Take a generic chat host whose raw MCP `resource` already reaches the client untouched: integration
is to detect a Mosaic resource in the tool result, render it with `<Mosaic source={text}
onIntent={…} />` in place of the JSON dump, map the semantic tokens onto the app's existing design
system through the host's own components, and route `onIntent` through the app's existing "start a
turn" / "answer a request" commands.
Almost nothing changes server-side; the work is a renderer drop-in.

---

## 8. Security

Mosaic's security rests on three claims, each enforced at a distinct layer ([invariants
1-3](../ARCHITECTURE.md#invariants)):

1. **Mosaic cannot express executable code (parse-time).** The grammar admits only JSON literals
   plus the interpreted `expr(...)` call; lowercase tags, `style`, `class`, and
   event-handler attributes are rejected. Every downstream stage operates on a code-free AST.
2. **`expr` is safe by construction.** It is CEL-class - non-Turing-complete, terminating,
   side-effect-free - AST-interpreted (never `eval`), statically cost-bounded, with recursion and
   user functions forbidden forever and circular derivations rejected as DAG cycles. It reads only
   local state and cannot loop, exfiltrate, or run code.
3. **Every action is the host's.** An `on:event` hands the host a named intent; the host decides
   whether and how to act. The model never sees credentials, and the artifact has no live channel
   out.

**The `<Embed>` escape hatch.** For the rare arbitrary-iframe case, `<Embed src="https://...">`
follows the SEP-1865 pattern - sandbox proxy on a separate origin, CSP allowlist, `postMessage`
only - and is denied by default.
It is one named primitive a host can refuse, not a general capability.

**Prompt injection.** Because data is baked in rather than pulled live, the "a tool return smuggles
adversarial UI into the artifact" vector is closed on the common path.
The residual risk is a host intent the user is talked into triggering; the mitigation is that
intents are named, rendered, and gated by the host, never silent.

---

## 9. Token efficiency

Mosaic is compact to emit because the model writes structure only - the styling lives in the host's
renderer, so there is no `class`, `style`, or inline design to carry.
For the same interface, Mosaic also runs a little lighter than its own IR in JSON (roughly 1.1-1.7×
fewer tokens than the minified IR, more against pretty-printed JSON), because positional children
and self-closing leaves avoid repeating `type`/`props`/`children` on every node.
Flat tabular data is the exception, which is why tables and series ride in prop-arrays.

The figures below use `o200k_base` as a tokenizer proxy and compare each interface with a
hand-written HTML equivalent.
They are **projections** until a bake-off harness measures them against a real HTML gallery.

| Interface                   | HTML tokens | Mosaic tokens | Ratio |
| --------------------------- | ----------: | ------------: | ----: |
| Implementation plan         |     ~14,000 |          ~520 |   27× |
| Module map (as a `Tree`)    |      ~6,000 |          ~190 |   32× |
| Triage board (as a `Board`) |     ~10,000 |          ~210 |   48× |
| Slide deck                  |      ~4,500 |          ~360 |   13× |

---

## 10. Relation to other work

Mosaic sits among several declarative-UI efforts and borrows from each:

- **Adaptive Cards** - host-themed declarative UI over a shared component set. Mosaic adds free
  composition and a derived-value model, and can be transformed to Adaptive Cards downstream.
- **A2UI** - the nearest neighbor for declarative local interaction. Mosaic shares the posture and
  adds a precisely specified expression catalog and a builder-owned theme, on a JSX wire, compatible
  at the AST level.
- **MCP Apps (SEP-1865)** - prior art for tool-delivered interfaces. Mosaic takes the other road:
  the artifact rides the reply stream itself ([§7.1](#71-delivery)), and MCP carries only the
  introspection tools.
- **Markdown and HTML** - what agents emit today. Mosaic offers a cheaper, themeable, safe option
  for the spatial cases where a picture reads better than text.

Mosaic is meant to fit alongside these, not replace them: it can be transformed to Adaptive Cards
or A2UI downstream.

---

## 11. Adoption

The build order is the [roadmap](../ROADMAP.md); the reference implementation is the four packages
in [`packages/`](../packages), described in
[ARCHITECTURE.md](../ARCHITECTURE.md#package-boundaries).

Teaching a model to emit Mosaic has three layers: a compact system-prompt primer (the JSX pattern,
the building blocks and directives from the manifest, the `expr` catalog, a few canonical examples);
the validator-to-model feedback loop; and, where the host controls the decoder, CFG-constrained
decoding of the Mosaic grammar for validity-by-construction.

Governance: the format evolves through numbered, reviewed design changes with a comment period and
two implementations, and eventually a home in the MCP UI working group or the Agentic AI Foundation.
Long-form **"Mosaic Format"** or **"Mosaic UI"** disambiguates from NCSA Mosaic, the 1990s web
browser (historical and inactive), in formal publication.

---

## 12. Open questions & residual risks

- **Subset leakage.** No shipped system emits a deliberately JS-free JSX subset, so the real-world
  leak rate (`{expr}`, `.map`, `className`) is unmeasured. Close it mechanically (grammar +
  validator) and measure it with an in-house eval; this is the one genuinely open risk in the
  language.
- **The expr catalog.** Whether the function set is the right set, and where the static cost bound
  should sit, is empirical. Recursion and user functions stay forbidden regardless.
- **The macro mechanism.** Resolved in 0.7: a macro is a `BlockDefinition` with an `expandsTo`
  template, registered through `createRegistry`, and shared as plain data.
- **The no-JS ceiling.** Mosaic can never host a live notebook, an in-artifact editor, or a game;
  those need real code, and `<Embed>` is the escape hatch. Markdown is a report, Mosaic is an
  interface, a Turing-complete artifact is a different beast - MCP Apps already exists for it.
- **Bring-your-own-renderer parity.** Mosaic ships one reference renderer; other surfaces are the
  builder's to write, and component coverage will vary. `decompose` manages the gap; it does not
  erase it.

---

## 13. Acknowledgments

Mosaic stands on a long lineage: **Thariq Shihipar**, whose essay and gallery catalyzed this; the
**Adaptive Cards** team at Microsoft (the host-themed, catalog-safe declarative UI prior art); the
**MCP Apps / SEP-1865** working group, whose iframe trust model shaped `<Embed>`'s posture;
**Google A2UI**, the nearest prior art for declarative local interaction; the **Vega /
Vega-Lite** teams and the **CEL** authors, whose bounded-expression design grounds the `expr` model;
**Pandoc** (the `reader -> AST -> writer` architecture); the **React** core team; and **safe-mdx**,
the existence proof that a JSX-shaped format renders with no JavaScript evaluation.

Full references are in [`docs/`](.) alongside this proposal.
