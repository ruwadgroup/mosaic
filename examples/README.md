# Examples

Complete, hand-written Mosaic documents - the kind of thing an agent actually emits when you ask it to **plan** something, **mock a screen** before you build it, **compare** options, or **show** you a trace instead of describing it.

Each file is one `.mosaic` artifact: a ` ```mosaic v=1 id=… ` fence with the JSX body inside.
Strip the fence and the body is what the model emits; the fence is how the host routes and identifies the artifact.
Open any of them in a plain text editor - the syntax is its own documentation.

Everything here is composed from **general building blocks** - there is no `<Plan>`, `<Comparison>`, or `<Pricing>` tag.
A comparison is a `Stack` of `Card`s and a `DataTable`; a plan is `Steps` + `Timeline` + a filtered `List`; a pricing page is `Slider`s and `Toggle`s feeding derived `Stat`s.
Styling is theme-only (`tone="warn"`, never a hex), and interaction is local and reactive: `value={path}` bindings, derived `{expressions}`, `{cond && <El/>}` conditionals, `{list.map(...)}` loops, and `set`/`toggle` on an event.

## The examples

| File                                                           | Job it does                                                  | What it shows off                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`compare-memory-layer.mosaic`](./compare-memory-layer.mosaic) | **Compare** - an opinionated product landscape with verdicts | `Card` + `Badge`/`Tag` + tone legend + `Callout`, and a `SegmentedControl` that **re-scores the whole field** for your audience via conditionals     |
| [`pricing-estimator.mosaic`](./pricing-estimator.mosaic)       | **Mock UI** - a pricing page whose numbers are real          | `Slider`/`Toggle`/`SegmentedControl` driving live `Stat`s, a `Chart`, and a CTA - every figure a derived `expr`, recomputed locally                  |
| [`tip-splitter.mosaic`](./tip-splitter.mosaic)                 | **Calculator** - split a bill, tip included                  | computed `set(path, expression)` writes: steppers with `clamp`, tip presets, totals re-deriving on every click                                       |
| [`mock-settings.mosaic`](./mock-settings.mosaic)               | **Mock UI** - a settings screen before you build it          | The control catalog wired to state: `Field` + `Input`/`Select`/`Radio`/`Toggle`/`Checkbox`/`Slider`, tabbed by `SegmentedControl`, one `Save` intent |
| [`plan-migration.mosaic`](./plan-migration.mosaic)             | **Plan** - a migration you can work from                     | `Steps` + `Timeline` + `Stat` + `Progress` + a risk `DataTable`, and a `List` that **filters live by owner** via `{tasks.filter(…).map(…)}`          |
| [`review-changes.mosaic`](./review-changes.mosaic)             | **Ship** - a diff review that hands you the call             | **Record state** - `{files.map((f, i) => …)}` rows, `Checkbox`es bound to `files[i].checked`, stats and commit button folding over one `files` array |
| [`request-path.mosaic`](./request-path.mosaic)                 | **Explain** - a system design, drawn not described           | A clickable `Diagram` - selection binds to state, conditionals swap the detail card per node, and the queue's card carries an `openRunbook` intent   |
| [`network-waterfall.mosaic`](./network-waterfall.mosaic)       | **Visualize** - a performance trace made visible             | A `VegaChart` waterfall of a page load, a `Stat` row, a `DataTable` of requests, and a `Callout` calling out the serial tail                         |

## How to read them

Two families run through the set:

**Static-but-rich** (`compare`, `network-waterfall`) is thinking made _legible_ - the agent's analysis laid out as a real interface instead of a wall of prose. No interaction; all the value is in the composition and the theme.

**Local and reactive** (`pricing-estimator`, `mock-settings`, `plan-migration`, `request-path`, `review-changes`) adds a client-side loop that needs no round-trip:

- `value={seats}` two-way binds a control; `state={{ … }}` on the root bakes in the starting data.
  Bind targets are **paths**: `checked={files[i].checked}` writes one field of one record, and `value={selected}` on a `Diagram` holds the clicked node's id.
- `{seats * 16}` is a **derived value** - a bounded, pure expression that recomputes whenever its inputs change. The pricing total, the "showing N of M" line, and the commit button label are all folds (`filter`, `sum`, `.length`, ternaries) over baked-in state.
- `{selected == 'queue' && <Card>…</Card>}` renders a subtree only when a condition holds.
- `{files.map((f, i) => <Stack>…</Stack>)}` instantiates a row per item over a baked-in array, binding the item and its index; mapping a derived list works too: `{tasks.filter(t => …).map(task => …)}`.
- Clicking a `Diagram` node (or `onClick={set(stage, 'db')}` anywhere) mutates local state - no round-trip; `onClick={startCheckout({ total: seats * 16 })}` hands the **host** a named intent carrying the _computed_ value. Only the second one leaves the artifact.

Nothing here fetches, subscribes, or runs code. The data is baked in when the model produces it, and every expression is interpreted, terminating, and side-effect-free ([invariant 2](../ARCHITECTURE.md#invariants)).

## `id`, diffing, and the fence

The fence `id=…` is **stable across regeneration**: when the model emits a new version of the same artifact it reuses the id, and the host replaces the previous tree with the new one - that's the diffability story ([§7.3](../docs/proposal.md#73-integrating-into-a-host-a-worked-example)).
Canonical serialization (one tag per line, alphabetical attributes, stable `key`s) is what makes two regenerations diff cleanly.

## File extension and MIME type

`.mosaic` is treated as JSX by [`.gitattributes`](../.gitattributes) so GitHub highlights it sensibly.
These files are **Mosaic source** - the JSX a model writes; it compiles one-way to the **IR**, a canonical tree serialized as JSON for storage and delivery (`Mosaic -> IR`).
Delivered over MCP (optional - rendering an artifact with `<Mosaic>` needs no MCP at all), an artifact rides as a `ui://` resource with mimeType `application/vnd.mosaic+json`, rendered natively by a Mosaic-aware host with no iframe.
