# The block catalog

Mosaic ships **general building blocks, never domain templates** ([proposal §4](proposal.md#4-the-building-blocks)).
There is no `<Plan>` or `<RiskTable>`; a plan is a `Stack` of a `Timeline` and a `DataTable`, composed.
This page is the practical reference for every block in the registry: what it is, the props that matter, and how it behaves where the renderer is limited.
The normative prop schemas live in [`schema/primitives.schema.json`](../schema/primitives.schema.json).

The catalog itself is a **proposal, not a wall**.
This set is what we ship because it is efficient - general shapes a model emits cheaply, broad enough that common affordances need no hand-composition - but it is designed to be added to: a host extends it with [its own blocks and macros](custom-blocks.md) today, and the shared registry evolves through the [design process](../CONTRIBUTING.md#design-changes).
What is fixed is the grammar and the invariants, not the block list.

Conventions that hold across the catalog:

- **Meaning, not measurements.** The format carries structure and semantic tokens; it has no spacing, size, or typography knobs - the host owns density, type, and chrome ([invariant 6](../ARCHITECTURE.md#invariants)).
  `tone` is the semantic token the host's renderer maps to its own palette: `ok | warn | bad | primary | subtle`.
- **`alt` is required on every visual block** - `Image`, `Video`, and all the charts and diagrams - and validation fails without it ([invariant 7](../ARCHITECTURE.md#invariants)).
- **Controls bind with `bind:state`.** Any control works without a bind too - it runs on renderer-local state, so a mock stays a live mock.

## Layout

| Block     | What it is                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| `Box`     | The plain grouping container                                                      |
| `Stack`   | Flow layout; `direction="horizontal"` for a row, `align`/`justify` place children |
| `Grid`    | Column grid; `cols` is the column count, children divide it equally               |
| `Divider` | A hairline rule                                                                   |
| `Card`    | A themed surface; `tone` tints it into an inset status panel                      |

## Content

| Block      | What it is                                                                                |
| ---------- | ----------------------------------------------------------------------------------------- |
| `Text`     | Body text; `tone`, `variant="label"` (micro-label) / `variant="caption"` (secondary text) |
| `Heading`  | `level={1..6}`, default 2                                                                 |
| `Markdown` | Sanitized prose; no HTML passthrough                                                      |
| `Image`    | `src`, **`alt` required**                                                                 |
| `Icon`     | `name` - a semantic icon name the host maps                                               |
| `Link`     | `href`; children as the label, else the href shows                                        |
| `Badge`    | Small status chip; `tone`                                                                 |
| `Tag`      | Removable label chip; `tone`                                                              |
| `Avatar`   | Entity image or initials (`name` / `initials`); group via `AvatarGroup`                   |
| `Code`     | Monospaced block; `value` prop or children                                                |
| `Callout`  | Inline info/warn/error notice; `tone` colors the accent                                   |

## Controls

Every control takes a `label` and pairs with `bind:state` (see [State and events](interactivity.md)).

| Block          | What it is                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `Button`       | `variant` = `primary \| secondary \| subtle \| danger` intent hierarchy; actions via `on:event` |
| `Input`        | `type = text \| number \| email \| password \| textarea \| search`, `placeholder`, `value`      |
| `Select`       | Single choice over `options`                                                                    |
| `MultiSelect`  | Multiple choices over `options`; the bound value is an array                                    |
| `Autocomplete` | Type-ahead over baked-in `options`; filtering is local, nothing is fetched                      |
| `Checkbox`     | `checked` / bound boolean; `label`                                                              |
| `Radio`        | One choice from `options`, drawn as a group                                                     |
| `Toggle`       | A switch; bound boolean                                                                         |
| `Slider`       | `min`, `max`, `step`; bound number                                                              |
| `DatePicker`   | Bound ISO date string                                                                           |
| `ColorPicker`  | Bound color string                                                                              |
| `FilePicker`   | File input; selection is host-side, nothing uploads                                             |
| `Rating`       | `max` (default 5); bound number                                                                 |
| `TagInput`     | Free-entry tags; the bound value is an array of strings                                         |
| `Field`        | Label + control + help + error wrapper - the form workhorse                                     |
| `Disclosure`   | One collapsible section; `label`                                                                |
| `Accordion`    | A set of disclosures                                                                            |

## Structure and status

| Block              | What it is                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Tabs`             | `items` = labels, `active` = default tab (label or index), one child panel per item; bind to drive from state |
| `Steps`            | Ordered wizard/progress steps; `items`, `current`                                                             |
| `SegmentedControl` | One choice from `options`, drawn as segments; the compact scenario switcher                                   |
| `Progress`         | A completion value 0-100 with optional `label` - a value, not a loading spinner                               |
| `Empty`            | Empty-state placeholder; `label`                                                                              |

## Media

| Block      | What it is                      |
| ---------- | ------------------------------- |
| `Video`    | **`alt` required**              |
| `Audio`    | Audio clip                      |
| `Carousel` | Sequential media/content panels |

## Data and viz

All of these are rich blocks: each carries a normative `decompose` recipe, so a renderer that cannot draw one renders the primitive expansion instead ([invariant 8](../ARCHITECTURE.md#invariants)).
The Floor column names that expansion.

| Block       | What it is                                                                                                                                               | Floor                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `DataTable` | `columns` + `rows` as prop-arrays; sortable/filterable where the renderer can                                                                            | Bold header line, one text row per data row               |
| `List`      | Itemized list with a row template via children                                                                                                           | A `Stack` of its children                                 |
| `Tree`      | General hierarchy from `items`                                                                                                                           | One line per item label                                   |
| `Board`     | Columns of cards (kanban, triage) from `items`                                                                                                           | One line per item title                                   |
| `Timeline`  | `items` of `{date, title, description?, tone?}`                                                                                                          | `date - title - description` lines                        |
| `Calendar`  | Dated items on a month/week/day grid                                                                                                                     | `date - title` lines                                      |
| `Stat`      | Big `value` + `label`, optional delta/trend                                                                                                              | `label: value` as text                                    |
| `Chart`     | One chart; `type = bar \| line \| area \| donut \| radar \| gauge \| scatter`, data in prop-arrays, **`alt` required**                                   | Its `alt` text                                            |
| `VegaChart` | A full Vega-Lite spec as an inline JSON literal - a grammar, not a fixed set; **`alt` required**                                                         | Its `alt` text                                            |
| `Diagram`   | Declarative `nodes` / `edges` / `groups`; renderer-owned layout; selection binds to state; **`alt` required**                                            | `alt`, grouped node lines, one `from -> to` line per edge |
| `Canvas`    | Inline sanitized SVG - the bespoke escape hatch; **`alt` required**                                                                                      | Its `alt` text                                            |
| `Embed`     | The gated iframe escape hatch - **denied by default** ([proposal §8](proposal.md#8-security))                                                            | Its `alt` text                                            |

### `Diagram` in one example

`Diagram` replaces hand-drawn SVG for the explainer genre - flows, funnels, layered maps ([proposal §4.3](proposal.md#43-data--viz-components)):

```jsx
<Diagram alt="Request path from client to database" bind:state="selected"
  nodes={[
    { id: "client", label: "Client", kind: "client" },
    { id: "api",    label: "API",    kind: "service", badge: "p95 340ms" },
    { id: "db",     label: "Postgres", kind: "store", tone: "warn", group: "data" }
  ]}
  edges={[
    { from: "client", to: "api", label: "HTTPS" },
    { from: "api", to: "db", dashed: true }
  ]}
  groups={[{ id: "data", label: "Data plane" }]} />
<Card if:show="selected == 'db'">…detail panel…</Card>
```

Clicking a node writes its id to the bound path; clicking the background writes `null`; an authored `on:event` `select` intent escalates the selection to the host with `{ id }` merged into its args.
Node `kind` is a semantic shape token (`service | store | queue | client | external | concept | code`); unknown kinds render as the default box.
Ids must be unique across nodes and groups, and edge endpoints must resolve - `validate` reports `INVALID_DIAGRAM` otherwise.

## What is deliberately absent

An artifact is embedded content inside a host, not an app.
Modals, drawers, popovers, tooltips, menus, toasts, breadcrumbs, pagination chrome, and navigation are the **host's** chrome; an action that would open a modal is an `on:event` intent the host handles.
There are no spinners or skeletons because an artifact's data is baked in - there is nothing to wait for ([invariant 4](../ARCHITECTURE.md#invariants)).
Recurring whole-interface shapes (`Plan`, `Incident`) are [host-defined blocks](custom-blocks.md) with `expandsTo` macro templates, not vocabulary - see [custom blocks](custom-blocks.md) for defining your own.

## Unknown tags

A tag not in the registry is a warning by default - renderers draw its children in order so the content still shows - and an error when the manifest sets `strict: true`.
