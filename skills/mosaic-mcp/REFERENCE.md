# Mosaic patterns

Interaction patterns and sizing notes for [the skill](SKILL.md).

## Action rows (text left, buttons right)

The approval row - one line, actions right-aligned:

```jsx
<Card state={{}}>
  <Text variant="label" tone="subtle">Needs a quick yes</Text>
  <Stack direction="horizontal" justify="between" align="center">
    <Text>Pay £340 invoice to Studio Kern</Text>
    <Stack direction="horizontal">
      <Button>Approve</Button>
      <Button variant="subtle">Skip</Button>
    </Stack>
  </Stack>
  <Stack direction="horizontal" justify="between" align="center">
    <Text>Send reply to Meridian's CEO</Text>
    <Stack direction="horizontal">
      <Button>Review</Button>
      <Button variant="subtle">Send</Button>
    </Stack>
  </Stack>
</Card>
```

A toned card makes an inset status panel:

```jsx
<Card tone="ok" state={{}}>
  <Text variant="label" tone="ok">Handled while you slept</Text>
  <Text>Sorted 38 emails, archived 22 newsletters</Text>
  <Text>Drafted 2 replies, waiting in your outbox</Text>
</Card>
```

## Per-row state (selection lists, checklists)

Bind through a path with the map index; fold over the same array for the summary:

```jsx
<Stack state={{ files: [
  { path: "src/api.ts", checked: true },
  { path: "src/db.ts", checked: false }
] }}>
  {files.map((f, i) => (
    <Stack key={f.path} direction="horizontal">
      <Checkbox checked={files[i].checked} label={f.path} />
    </Stack>
  ))}
  <Text tone="subtle">{`${files.filter((f) => f.checked).length} of ${files.length} selected`}</Text>
  <Button onClick={commit({ paths: files.filter((f) => f.checked).map((f) => f.path) })}>
    Commit selected
  </Button>
</Stack>
```

## Detail-on-click diagram

`value={selected}` on a `Diagram` holds the clicked node id (null on background); a `&&` sibling swaps the detail panel:

```jsx
<Stack state={{ selected: null }}>
  <Diagram alt="Request path" value={selected} direction="down"
    nodes={[
      { id: "client", label: "Client", kind: "client" },
      { id: "api", label: "API", kind: "service", badge: "p95 340ms" },
      { id: "db", label: "Postgres", kind: "store", tone: "warn" }
    ]}
    edges={[
      { from: "client", to: "api", label: "HTTPS" },
      { from: "api", to: "db", dashed: true }
    ]} />
  {selected == "db" && (
    <Card>
      <Heading level={4}>Postgres</Heading>
      <Text>Connection pool saturates under load; the dashed edge is the async path.</Text>
    </Card>
  )}
</Stack>
```

Ids must be unique; every `edges[].from`/`to` must name one.
Node `kind`: `service store queue client external concept code`.

## Scenario switch (no round-trip)

```jsx
<Stack state={{ audience: "SaaS" }}>
  <SegmentedControl value={audience} options={["SaaS", "Bank"]} />
  {audience == "SaaS" && <Callout tone="ok">Zep wins: point-in-time recall, no graph to operate.</Callout>}
  {audience == "Bank" && <Callout tone="warn">Neither survives an audit alone.</Callout>}
</Stack>
```

## Live-filtered list

Map over a derived array; the source stays baked in:

```jsx
<Stack state={{ owner: "all", tasks: [
  { title: "Snapshot", owner: "dana" },
  { title: "Cutover", owner: "raj" }
] }}>
  <Select value={owner} options={["all", "dana", "raj"]} label="Owner" />
  {tasks.filter((t) => owner == "all" || t.owner == owner).map((t) => (
    <Text key={t.title}>{`${t.title} - ${t.owner}`}</Text>
  ))}
</Stack>
```

## Layout notes

- `Stack` - column by default; `direction="horizontal"` for rows; `justify` and `align` place children (structure, not spacing).
- `Grid` - `cols` is the column count; children split it evenly.
- Local mutations: `set(path, expression)` writes a computed value (`set(count, count + 1)`, `set(display, display + "7")`), `toggle(path)` flips a boolean; anything beyond local state crosses via an intent's args.

## Chart & Diagram sizing

The artifact renders in a chat column, so width is scarce.

- `Chart` - keep to ~8 categories or fewer; use a `DataTable` beyond that.
- `Diagram` - `direction="right"` only for small graphs (~5 nodes across or fewer); otherwise `direction="down"` so it grows vertically instead of squishing. Short node labels.
