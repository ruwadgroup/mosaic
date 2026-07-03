# Examples

Complete, hand-written Mosaic documents - the kind of thing an agent actually emits when you ask it to **plan** something, **mock a screen** before you build it, **compare** options, or **show** you a trace instead of describing it.

Each file is one `.mosaic` artifact: a ` ```mosaic v=1 id=… ` fence with the JSX body inside.
Strip the fence and the body is what the model emits; the fence is how the host routes and identifies the artifact.
Open any of them in a plain text editor - the syntax is its own documentation.

Everything here is composed from **general building blocks** - there is no `<Plan>`, `<Comparison>`, or `<Pricing>` tag.
A comparison is a `Stack` of `Card`s and a `DataTable`; a plan is `Steps` + `Timeline` + a filtered `List`; a pricing page is `Slider`s and `Toggle`s feeding derived `Stat`s.
Styling is theme-only (`tone="warn"`, never a hex), and interaction is local and reactive (`bind:state`, `expr(...)`, `if:show`, `for:each`, and `state.set` on an event).

## The examples

| File                                                           | Job it does                                                  | What it shows off                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`compare-memory-layer.mosaic`](./compare-memory-layer.mosaic) | **Compare** - an opinionated product landscape with verdicts | `Card` + `Badge`/`Tag` + tone legend + `Callout`, and a `SegmentedControl` that **re-scores the whole field** for your audience via `if:show`        |
| [`pricing-estimator.mosaic`](./pricing-estimator.mosaic)       | **Mock UI** - a pricing page whose numbers are real          | `Slider`/`Toggle`/`SegmentedControl` driving live `Stat`s, a `Chart`, and a CTA - every figure a derived `expr`, recomputed locally                  |
| [`mock-settings.mosaic`](./mock-settings.mosaic)               | **Mock UI** - a settings screen before you build it          | The control catalog wired to state: `Field` + `Input`/`Select`/`Radio`/`Toggle`/`Checkbox`/`Slider`, tabbed by `SegmentedControl`, one `Save` intent |
| [`plan-migration.mosaic`](./plan-migration.mosaic)             | **Plan** - a migration you can work from                     | `Steps` + `Timeline` + `Stat` + `Progress` + a risk `DataTable`, and a `List` that **filters live by owner** with `for:each` over `filter(...)`      |
| [`request-path.mosaic`](./request-path.mosaic)                 | **Explain** - a system design, drawn not described           | Tone-coded `Card` stages with `Canvas` arrows; each stage is clickable (`state.set`) and reveals its detail panel via `if:show`                      |
| [`network-waterfall.mosaic`](./network-waterfall.mosaic)       | **Visualize** - a performance trace made visible             | A `VegaChart` waterfall of a page load, a `Stat` row, a `DataTable` of requests, and a `Callout` calling out the serial tail                         |

## How to read them

Two families run through the set:

**Static-but-rich** (`compare`, `network-waterfall`) is thinking made _legible_ - the agent's analysis laid out as a real interface instead of a wall of prose. No interaction; all the value is in the composition and the theme.

**Local and reactive** (`pricing-estimator`, `mock-settings`, `plan-migration`, `request-path`) adds a client-side loop that needs no round-trip:

- `bind:state="seats"` two-way binds a control; `state={{ … }}` on the root bakes in the starting data.
- `{expr("…")}` is a **derived value** - a bounded, pure expression that recomputes whenever its inputs change. The pricing total, the "showing N of M" line, and the progress bar are all `expr` folds (`count`, `filter`, `sum`, ternaries) over baked-in state.
- `if:show="tab == 'Profile'"` renders a subtree only when a condition holds.
- `for:each="filter(tasks, t, …) as task"` instantiates a row per item over a baked-in array.
- `on:event={{ click: "state.set('stage', 'db')" }}` mutates local state (no round-trip); `on:event={{ click: { action: "startCheckout", args: { total: expr("…") } } }}` hands the **host** a named intent carrying the _computed_ value. Only the second one leaves the artifact.

Nothing here fetches, subscribes, or runs code. The data is baked in when the model produces it, and every expression is interpreted, terminating, and side-effect-free ([invariant 2](../ARCHITECTURE.md#invariants)).

## `id`, diffing, and the fence

The fence `id=…` is **stable across regeneration**: when the model emits a new version of the same artifact it reuses the id, and the host replaces the previous tree with the new one - that's the diffability story ([§7.3](../docs/proposal.md#73-integrating-into-a-host-t3-code-as-the-worked-example)).
Canonical serialization (one tag per line, alphabetical attributes, stable `key`s) is what makes two regenerations diff cleanly.

## File extension and MIME type

`.mosaic` is treated as JSX by [`.gitattributes`](../.gitattributes) so GitHub highlights it sensibly.
These files are **Mosaic source** - the JSX a model writes; it compiles one-way to the **IR**, a canonical tree serialized as JSON for storage and delivery (`Mosaic -> IR`).
Delivered over MCP (optional - `render(source)` works with no MCP at all), an artifact rides as a `ui://` resource with mimeType `application/vnd.mosaic+json`, rendered natively by a Mosaic-aware host with no iframe.
