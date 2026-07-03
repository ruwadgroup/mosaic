---
name: mosaic
description: Render the reply as a Mosaic artifact - a live, interactive interface the host app draws natively in its own design - instead of prose. Use when the answer is spatial or interactive: visualizing an architecture or flow, mocking a screen, comparing options, laying out a plan, charting data, or building an estimator or dashboard - or when the user says mosaic or asks to see an interface.
---

# Emitting Mosaic

You write standard JSX from a fixed block vocabulary; the host draws every block with its own components, and interaction runs locally (a slider drives a total with no round-trip to you).
The JSX is **data, never code**: expressions run in a bounded, pure interpreter, and events become named **intents** the host brokers.

If prose reads just as well linearly, write prose.
One artifact per reply, commentary outside the fence.
Fence it as ` ```mosaic v=1 id=kebab-id ` and reuse the same `id` when regenerating so the host replaces the artifact in place.

## Compose

1. **Bake the state.**
   Declare every value interaction touches in the root's `state={{…}}` (a literal object).
   Everything the artifact shows lives in its props at emit time; nothing fetches or refreshes later - never a spinner.
   Done when no expression reads a name missing from `state` or a `.map` binding.
2. **Lay out from blocks.**
   Nest `Stack` / `Grid` / `Card`; pick from the vocabulary below.
   There is no `<Plan>` tag - a plan is `Steps` + `Timeline` + a `DataTable`.
   Done when every tag is in the block list and every repeated shape is one `.map`, not copy-paste.
   Unsure about props? `mosaic_cat` takes one or more blocks ("DataTable, Chart, Stack") and returns exact schemas; `mosaic_ls` lists every block.
   Your client may namespace these tools (e.g. `mcp__<server>__mosaic_cat`); if a bare name is not found, search your tool registry for `mosaic` once and use the full names it returns.
3. **Wire the interaction.**
   `value={path}` / `checked={path}` two-way binds a control (a computed expression there is read-only).
   `{cond && <El/>}` and ternaries render conditionally; `{list.map((item) => <El key={…}/>)}` repeats.
   `onClick={saveDraft({ total: seats * 16 })}` hands the host an intent with computed args; `onClick={toggle(open)}` / `onClick={set(count, count + 1)}` mutate locally - `set` takes any expression, evaluated against current state at click time, so counters and calculators work.
   Done when everything computable computes locally and every event is an intent or a local mutation.
4. **Validate, then emit.**
   Run `mosaic_validate` on the draft and fix every reported error.
   Done when it returns VALID.

## Boundaries

Each of these is a compile error:

- **Blocks only.** No HTML tags. The host owns the design: no `className`, no `style`, no raw colors - speak in semantic tokens (`tone="warn"`).
- **Bounded expressions.** Arithmetic, comparisons, `&& || !`, ternary, template literals, and array methods (`.map .filter .reduce .sort .slice .join .includes .length`) work; the function catalog is `abs min max round floor ceil clamp · len lower upper trim concat substr replace split join contains · formatCurrency formatNumber toFixed · map filter reduce sum count any all sort sortBy slice · has coalesce`. No assignments, no `new`, no regex, no other functions. Unknown names evaluate to null.
- **`alt` required** on `Chart` and `Diagram`.
- **Host chrome stays the host's.** Modals, toasts, and navigation are requested through an intent, never drawn.

## Blocks

**Layout.** `Box` `Stack` `Grid` `Divider` `Card`
**Content.** `Text` `Heading` `Markdown` `Image` `Icon` `Link` `Badge` `Tag` `Avatar` `AvatarGroup` `Code` `Callout`
**Controls.** `Button` `Input` `Select` `MultiSelect` `Autocomplete` `Checkbox` `Radio` `Toggle` `Slider` `DatePicker` `ColorPicker` `FilePicker` `Rating` `TagInput` `Field` `Disclosure` `Accordion`
**Structure.** `Tabs` `Steps` `SegmentedControl` `Progress` `Empty`
**Media.** `Video` `Audio` `Carousel`
**Data & viz.** `DataTable` `List` `Tree` `Board` `Timeline` `Calendar` `Stat` `Chart` `VegaChart` `Diagram` `Canvas` `Embed`

`mosaic_ls` marks blocks this host adds beyond the built-ins with `(host)`; those exist only in this host, so recompose from primitives if you need to move an artifact elsewhere.

Structure, not style.
The format carries meaning and structure; the host owns spacing, typography, density, and chrome.
Express structure - sections, rows, groupings - and let the host render it dense.
There is no gap, padding, size, or weight to set: say what a thing *is*, not how big or how far apart.

- `Stack` - `direction="horizontal"` for rows; `justify="between"` puts text left and actions right on one row; `align` sets the cross axis.
- `Card` - `tone` tints it into an inset status panel (a green "handled" section).
- `Text` - `variant="label"` is a section micro-label; `variant="caption"` is secondary supporting text. Inline emphasis (bold, italic) belongs to `Markdown`.
- `Button` - `variant` is an intent hierarchy: `primary` (one per view), `secondary`, `subtle` (inline row actions), `danger` (destructive).
- **Icons are Lucide** (lucide.dev), kebab-case names: `<Icon name="wallet" />`, or a leading icon on a block - `<Badge icon="circle-check">…</Badge>`, `<Button icon="send">…</Button>`, `<Callout icon="sunrise">…</Callout>`. Use real Lucide names (`circle-check`, `triangle-alert`, `arrow-up-right`); an unknown name renders nothing.

Exact shapes for the data blocks:

- `DataTable` - `columns={["A","B"]}` and `rows={[["1","2"],["3","4"]]}` (positional string arrays, never objects).
- `Chart` - `type` (`bar line area donut radar gauge scatter`), `data={[{ label, value }]}`, `alt`.
- `Timeline` - `items={[{ date, title, description?, tone? }]}`.
- `Stat` - `label` + `value`; `tone` for the verdict color.
- `Tabs` - `items={["Overview","Docs"]}` + one child panel per item.
- Tones: `ok warn bad primary subtle`.

## Example

```mosaic v=1 id=seat-estimator
<Card state={{ seats: 12, annual: true }}>
  <Field label={`Seats: ${seats}`}>
    <Slider value={seats} min={1} max={200} />
  </Field>
  <Toggle checked={annual} label="Bill annually (save 20%)" />
  <Stat label={annual ? "Billed today (12 mo)" : "Billed monthly"}
        value={formatCurrency(seats * 16 * (annual ? 12 * 0.8 : 1))} />
  {seats >= 100 && <Callout tone="warn">Above 100 seats, Enterprise usually wins.</Callout>}
  <Button variant="primary" onClick={startCheckout({ seats: seats, total: seats * 16 * (annual ? 12 * 0.8 : 1) })}>
    Continue to checkout
  </Button>
</Card>
```

For interaction patterns (per-row selection, detail-on-click diagrams, live filters) and Chart/Diagram sizing, read [REFERENCE.md](REFERENCE.md) before composing anything beyond a simple card.
