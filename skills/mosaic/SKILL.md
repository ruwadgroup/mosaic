---
name: mosaic
description: Emit a Mosaic artifact - an interface composed from general blocks - instead of prose. Use when a reply is spatial (a plan, comparison, dashboard, estimator, mock screen, diagram, or trace), when the user asks for an interface or something interactive, or when a tool result should render as UI.
---

# Emitting Mosaic

> **Host note.** This skill is a template.
> Before attaching it, edit the [Blocks](#blocks-host-editable) section to mirror your manifest, and swap the example for one in your house idiom.
> Everything else is the format and holds for every host.

Mosaic turns your thinking into an interface the host renders in its own look.
You write **mosaic-jsx** - a strict JSX pattern that is data, never code.
There is nothing to execute: computation is `expr("…")`, actions are named intents, and the host draws every block.

## When to emit an artifact

Emit one when the reply is **spatial** - a plan, a comparison, a dashboard, a calculator, a mock screen, an architecture flow, a trace.
If prose reads just as well linearly, write prose.
One artifact per reply; put surrounding commentary outside the fence.

## The rules

These are inviolable; the host's compiler rejects violations.

1. **Data, never code.** Braces admit only JSON literals plus two calls: `token("…")` and `expr("…")`.
   Never `{eggs * 2}` (write `expr("eggs * 2")`), never `.map(...)` (use `for:each`), never arrow functions, template literals, or spread of identifiers.
2. **Blocks are PascalCase.** No HTML tags, no `class`, no `className`, no `style`.
3. **Tokens, not values.** `tone="warn"`, `gap="3"`, `token("color.accent")` - never a hex color, a pixel count, or a font name.
4. **Data is baked in.** Everything the artifact shows or computes over is in its props and `state={{…}}` at emit time.
   Nothing fetches, subscribes, or refreshes later.
5. **Every visual block carries `alt`** - `Image`, `Video`, `Chart`, `VegaChart`, `Diagram`, `Canvas`.
6. **Fence it.** Wrap the artifact in ` ```mosaic v=1 id=kebab-id ` … ` ``` `.
   Reuse the same `id` when regenerating the same artifact, so the host replaces instead of appending.

## Compose

1. **Bake the state.**
   Declare every value interaction will touch in the root's `state={{…}}` - it is the schema; writes never invent structure.
   Done when: no directive or expression references a name missing from `state` or from a `for:each` binding.
2. **Lay out from blocks.**
   Nest `Stack` / `Grid` / `Card` for structure; pick content and data blocks from [Blocks](#blocks-host-editable).
   Compose - there is no `<Plan>` tag; a plan is `Steps` + `Timeline` + a `DataTable`.
   Done when: every tag is in the block list and every repeated shape is one `for:each`, not copy-paste.
3. **Wire local interaction.**
   `bind:state` on controls (paths work: `files[i].checked`), `expr("…")` for derived values, `if:show` for conditionals, `for:each` for lists.
   Local means local: a slider driving a total needs no host round-trip.
   Done when: everything that can compute client-side does.
4. **Cross to the host only through intents.**
   `on:event={{ click: { action: "name", args: { total: expr("…") } } }}` - the args carry computed values.
   Local mutations use `state.set('path', literal)` / `state.toggle('path')`.
   Done when: no action pretends to fetch, navigate, or run anything itself.
5. **Self-check, then emit.**
   Done when every check passes; fix and re-check before emitting:
   - Each of [the rules](#the-rules) holds - walk the six against your tags, braces, tokens, `alt`, and fence.
   - Every name an expression or bind reads exists in `state` or a loop binding.
   - `Diagram` ids are unique and every edge endpoint is defined.

## Directives

| Directive    | Value                                  | Use                                            |
| ------------ | -------------------------------------- | ---------------------------------------------- |
| `bind:state` | state path                             | two-way bind a control                         |
| `from:state` | state path                             | read-only value                                |
| `from:expr`  | expression                             | derived value                                  |
| `if:show`    | boolean expression                     | conditional render                             |
| `for:each`   | `"EXPR as item"` / `"EXPR as item, i"` | repeat a subtree; `i` enables `items[i].field` |
| `on:event`   | `{ event: action }`                    | `state.set` / `state.toggle`, or a host intent |
| `key`        | string or `expr("…")`                  | stable identity for reorderable items          |

## expr

Bounded and pure: arithmetic, comparison, `&& || !`, ternary, `in`, indexing, list literals.
Functions - math: `abs min max round floor ceil clamp` · string: `len lower upper trim concat substr replace split join contains` · format: `formatCurrency formatNumber toFixed` · arrays: `map filter reduce sum count any all sort sortBy slice` (folds bind an item: `filter(rows, r, r.open)`) · misc: `has coalesce`.
No assignment, no user functions, no method calls (`items.map(…)` is invalid; `map(items, …)` is not).
Missing names evaluate to `null`, and the empty array is falsy.

## Blocks (host-editable)

**Layout.** `Box` `Stack` `Grid` `Divider` `Card`
**Content.** `Text` `Heading` `Markdown` `Image` `Icon` `Link` `Badge` `Tag` `Avatar` `Code` `Callout`
**Controls.** `Button` `Input` `Select` `MultiSelect` `Autocomplete` `Checkbox` `Radio` `Toggle` `Slider` `DatePicker` `ColorPicker` `FilePicker` `Rating` `TagInput` `Field` `Disclosure` `Accordion`
**Structure.** `Tabs` `Steps` `SegmentedControl` `Progress` `Empty`
**Data & viz.** `DataTable` `List` `Tree` `Board` `Timeline` `Calendar` `Stat` `Chart` `VegaChart` `Diagram` `Canvas`

Modals, toasts, menus, and navigation are the host's chrome - request them with an intent.
Never a spinner: your data is already baked in.

## Example

```mosaic v=1 id=seat-estimator
<Card gap="3" state={{ seats: 12, annual: true }}>
  <Field label={expr("concat('Seats: ', seats)")}>
    <Slider bind:state="seats" min={1} max={200} />
  </Field>
  <Toggle bind:state="annual" label="Bill annually (save 20%)" />
  <Stat label={expr("annual ? 'Billed today (12 mo)' : 'Billed monthly'")}
        value={expr("formatCurrency(seats * 16 * (annual ? 12 * 0.8 : 1))")} />
  <Callout if:show="seats >= 100" tone="warn">Above 100 seats, Enterprise usually wins.</Callout>
  <Button tone="primary" on:event={{ click: { action: "startCheckout", args: {
    seats: expr("seats"), total: expr("seats * 16 * (annual ? 12 * 0.8 : 1)")
  } } }}>Continue to checkout</Button>
</Card>
```

For per-row selection, detail-on-click diagrams, live-filtered lists, and the leak-fix table, read [REFERENCE.md](REFERENCE.md).
