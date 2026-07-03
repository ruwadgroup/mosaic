# Mosaic patterns

Deeper reference for [the skill](SKILL.md): interaction patterns, block notes, and the leak-fix table.

## Patterns

### Per-row state (selection lists, checklists)

Bind through a path with the `for:each` index; fold over the same array for the summary:

```jsx
<Stack
  gap="2"
  state={{
    files: [
      { path: "src/api.ts", checked: true },
      { path: "src/db.ts", checked: false },
    ],
  }}
>
  <Stack for:each="files as f, i" direction="horizontal" gap="2">
    <Checkbox bind:state="files[i].checked" label={expr("f.path")} />
  </Stack>
  <Text tone="subtle">{expr("concat(count(filter(files, f, f.checked)), ' of ', count(files), ' selected')")}</Text>
  <Button
    on:event={{
      click: {
        action: "commit",
        args: {
          paths: expr("map(filter(files, f, f.checked), f, f.path)"),
        },
      },
    }}
  >
    Commit selected
  </Button>
</Stack>
```

### Detail-on-click diagram

`bind:state` on a `Diagram` holds the clicked node id (`null` when the background is clicked); `if:show` swaps the detail panel:

```jsx
<Stack gap="3" state={{ selected: null }}>
  <Diagram
    alt="Request path"
    bind:state="selected"
    nodes={[
      { id: "client", label: "Client", kind: "client" },
      { id: "api", label: "API", kind: "service", badge: "p95 340ms" },
      { id: "db", label: "Postgres", kind: "store", tone: "warn", group: "data" },
    ]}
    edges={[
      { from: "client", to: "api", label: "HTTPS" },
      { from: "api", to: "db", dashed: true },
    ]}
    groups={[{ id: "data", label: "Data plane" }]}
  />
  <Card if:show="selected == 'db'" gap="2">
    <Heading level={4}>Postgres</Heading>
    <Text>Connection pool saturates under load; the dashed edge is the async path.</Text>
  </Card>
</Stack>
```

Ids must be unique across nodes and groups; every `edges[].from` / `to` must name one of them; `nodes[].group` must name a group.
Node `kind` tokens: `service store queue client external concept code`.

### Scenario switch (no round-trip)

```jsx
<Stack gap="3" state={{ audience: "SaaS" }}>
  <SegmentedControl bind:state="audience" options={["SaaS", "Bank"]} />
  <Callout if:show="audience == 'SaaS'" tone="ok">
    Zep wins: point-in-time recall, no graph to operate.
  </Callout>
  <Callout if:show="audience == 'Bank'" tone="warn">
    Neither survives an audit alone.
  </Callout>
</Stack>
```

### Live-filtered list

`for:each` over a derived array; the source stays baked in:

```jsx
<Stack
  gap="2"
  state={{
    owner: "all",
    tasks: [
      { title: "Snapshot", owner: "dana" },
      { title: "Cutover", owner: "raj" },
    ],
  }}
>
  <Select bind:state="owner" options={["all", "dana", "raj"]} label="Owner" />
  <Stack for:each="filter(tasks, t, owner == 'all' || t.owner == owner) as t" gap="1">
    <Text>{expr("concat(t.title, ' - ', t.owner)")}</Text>
  </Stack>
</Stack>
```

### Tabular data

Data rides in prop-arrays, never cell-by-cell children:

```jsx
<DataTable
  columns={["Risk", "Likelihood", "Impact", "Mitigation"]}
  rows={[
    ["Migration drift", "med", "high", "Snapshot before cutover"],
    ["Auth rate limit", "low", "med", "Cache + back-off"],
  ]}
/>
```

## Block notes

- `Stack` - `direction="horizontal"` for rows; default is a column.
- `Grid` - `cols` is the design grid (default 12); children split it evenly.
- `Tabs` - `items` are the labels, `active` the default (label or index), one child per item.
- `Chart` - `type` one of `line area bar donut radar gauge scatter heatmap sankey sparkline`; series data in prop-arrays; `alt` required.
- `VegaChart` - a full Vega-Lite spec as an inline JSON literal, for anything `Chart`'s types miss; `alt` required.
- `Timeline` - `items` of `{ date, title, description?, tone? }`.
- `Stat` - `value` + `label`; tone for the verdict color.
- `Canvas` - inline SVG as data, the last resort when `Diagram` / `Chart` / `VegaChart` cannot express it; `alt` required.
- State paths - `ident`, `.field`, `[index]` segments only: `filters.region`, `files[i].checked`.
  `state.set('path', literal)` takes a literal value (`true`, `3`, `'grid'`); to hand over a computed value, use an intent with `expr` args.

## Leak fixes

The reflexes to unlearn - each left column is a compile error:

| You wrote                          | Write instead                                  |
| ---------------------------------- | ---------------------------------------------- |
| `{seats * 16}`                     | `{expr("seats * 16")}`                         |
| `{items.map(i => <Row … />)}`      | `<Row for:each="items as i" … />`              |
| `className="mt-4"` / `style={{…}}` | `gap` / `pad` tokens on a layout block         |
| `color="#d97706"`                  | `tone="warn"` or `token("color.accent")`       |
| `` label={`${n} seats`} ``         | `label={expr("concat(n, ' seats')")}`          |
| `<div>` / `<span>`                 | `<Box>` / `<Text>`                             |
| `onClick={handler}`                | `on:event={{ click: "state.toggle('open')" }}` |
| a `Spinner` while data loads       | nothing - bake the data in                     |
