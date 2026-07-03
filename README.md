<div align="center">

# Mosaic

### AI thoughts, made visible

**Some thinking is easier to see than to read. Mosaic lets an agent turn its thinking into an interface your app renders natively, in your own look.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Proposal](https://img.shields.io/badge/proposal-founding-7c7cff.svg)](docs/proposal.md)
[![mosaic_version](https://img.shields.io/badge/mosaic__version-1.0--draft-7c7cff.svg)](docs/proposal.md)
[![Discussion](https://img.shields.io/badge/discuss-issues-blue.svg)](https://github.com/ruwadgroup/mosaic/issues)

</div>

Mosaic is for people building AI apps - Claude Code, t3-code, Codex, Cursor, and the like.

A lot of what an agent produces is spatial: a plan, a comparison, a dashboard, a calculator, a chart that visualizes the data.
A picture of that thinking is easier for a person to take in than paragraphs describing it.
Mosaic lets an agent express its thinking as a real interface, and lets your app render it natively.

The agent writes **Mosaic** - a small JSX pattern, composed from general building blocks.
It compiles to a canonical **IR** your renderer turns into UI, styled by you.
Interactivity is local: a slider can drive a computed total, a section can appear when a condition holds.
Everything an agent emits is data, so your host stays in control of what runs.

## What it's for

The things an agent is constantly asked to do are spatial: **plan** a migration, **mock** a screen before you build it, **compare** the options, **show** you a trace instead of describing it.
Today that comes back as prose. Mosaic lets the agent hand your app a real interface instead - composed from general blocks, styled by you.

**Compare** - an opinionated landscape, laid out to read at a glance, that re-scores itself for who you are when you flip the audience:

```jsx
<Stack gap="3" state={{ audience: "SaaS" }}>
  <Card gap="2">
    <Stack direction="horizontal" gap="2">
      <Heading level={3}>Mem0</Heading>
      <Badge tone="warn">partial fit</Badge>
    </Stack>
    <Text>Fastest path to "it remembers things" - but recall quality drifts as the store grows.</Text>
  </Card>
  <Card gap="2">
    <Stack direction="horizontal" gap="2">
      <Heading level={3}>Zep / Graphiti</Heading>
      <Badge tone="ok">strong fit</Badge>
    </Stack>
    <Text>Temporal knowledge graph. Leads on "what did we believe on the 8th?" - but you adopt a service, not a library.</Text>
  </Card>

  <SegmentedControl bind:state="audience" options={["SaaS", "Bank"]} />
  <Callout if:show="audience == 'SaaS'" tone="ok">
    Zep wins here: point-in-time recall without a graph of your own to operate.
  </Callout>
  <Callout if:show="audience == 'Bank'" tone="warn">
    Neither survives an audit alone - provenance has to live in your own database.
  </Callout>
</Stack>
```

`tone="ok"` is a theme token; the host resolves the color, so the verdict looks like your app.
And the flip is local: `if:show` swaps the verdict when the segmented control changes, with no round-trip to the model.

**Mock** a screen whose numbers are _real_. A control drives a derived value through a small, bounded expression language, and it recomputes locally as you drag - no code, no round-trip:

```jsx
<Card gap="3" state={{ seats: 12, annual: true }}>
  <Field label={expr("concat('Seats: ', seats)")}>
    <Slider bind:state="seats" min={1} max={200} />
  </Field>
  <Toggle bind:state="annual" label="Bill annually (save 20%)" />
  <Stat
    label={expr("annual ? 'Billed today (12 mo)' : 'Billed monthly'")}
    value={expr("formatCurrency(seats * 16 * (annual ? 12 * 0.8 : 1))")} />
  <Callout if:show="seats >= 100" tone="warn">Above 100 seats, Enterprise usually wins.</Callout>

  <Button tone="primary" on:event={{ click: { action: "startCheckout", args: {
    seats: expr("seats"),
    total: expr("seats * 16 * (annual ? 12 * 0.8 : 1)")
  } } }}>
    Continue to checkout
  </Button>
</Card>
```

Only what leaves the artifact - the "Continue to checkout" - crosses to the host, through an explicit `on:event` intent that carries the _computed_ total, not raw state.

## How it works

Two things, one contract between them:

- **Mosaic** is the JSX pattern the model writes - the only surface anyone authors.
- **The IR** is the canonical tree Mosaic compiles to - the format's identity, serialized to JSON for storage and the MCP payload.
- **Frameworks** turn the IR into a surface. `mosaic-react` is the reference we ship in TypeScript; another stack builds its own framework against the same IR.

Compilation is one-way - `Mosaic -> IR -> render` - and the IR, not the JSX, is the contract you build against.

Every block is rendered by **your** components: Mosaic is the standard - the block vocabulary and semantic tokens like `tone="warn"` the agent writes - and your renderer decides what each block actually looks like.
The tokens are names, never values: your renderer maps `tone="warn"` or `gap="3"` onto your design system, and the agent never writes a raw style.
The **`expr`** language gives an agent derived values, conditionals, and lists over local state; it is bounded and interpreted, so it computes but cannot loop forever or reach out.
For interop, Mosaic delivers over MCP: a tool returns the IR as a `ui://` resource an aware host renders natively. The core also works with no MCP at all.

## The packages

| Package                                    | Responsibility                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`mosaic-core`](packages/ts/mosaic-core)   | The Mosaic compiler (`Mosaic -> IR`), the IR, validate, resolve, the `expr` evaluator, `walk()`, the block registry, and the Host Manifest.    |
| [`mosaic-react`](packages/ts/mosaic-react) | The reference web framework - `render(source, { manifest, onAction })` over the IR.                                                            |
| [`mosaic-mcp`](packages/ts/mosaic-mcp)     | Optional delivery: `ui://` resources, the MCP-Apps bridge, and `on:event` relay.                                                               |
| [`mosaic-ansi`](packages/ts/mosaic-ansi)   | A text renderer, and the `decomposeTo` floor for surfaces that can't draw a rich component.                                                    |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
To render on another stack - SwiftUI, Compose, Flutter, a TUI - implement a `NodeVisitor` against `mosaic-core`'s `walk()`; `mosaic-react` is the worked example.

## See it

```bash
pnpm install && pnpm build && pnpm demo
```

That opens the [demo](demo/): a full agent-workspace app where every assistant reply is a live Mosaic artifact rendered by the app's own component kit.
Threads cover the real jobs - reviewing a diff before commit, approving a command, picking a model, reading test results - and every intent visibly does something: sliders drive derived totals, filters re-shape lists, and buttons hand the host computed args.

The [`examples/`](examples) directory has the complete, hand-written `.mosaic` files, each one a job an agent actually does:

- [`compare-memory-layer.mosaic`](examples/compare-memory-layer.mosaic) - **compare**: an opinionated product landscape that re-scores for your audience.
- [`pricing-estimator.mosaic`](examples/pricing-estimator.mosaic) - **mock UI**: a pricing page whose every figure is a live `expr`.
- [`plan-migration.mosaic`](examples/plan-migration.mosaic) - **plan**: a migration with a task list that filters live by owner.
- [`request-path.mosaic`](examples/request-path.mosaic) - **explain**: a clickable architecture flow, drawn not described.
- [`network-waterfall.mosaic`](examples/network-waterfall.mosaic) - **visualize**: a page-load trace as a real waterfall.

See the [examples README](examples/README.md) for the full set and how to read them.

## Where to read

- **[docs/getting-started.md](docs/getting-started.md)** - render an artifact in five minutes; the [docs index](docs/README.md) has the full reference set (language, blocks, state, `expr`, rendering, MCP).
- **[docs/proposal.md](docs/proposal.md)** - the full technical proposal; the definition of the format, cited by section number.
- **[docs/design-history.md](docs/design-history.md)** - the origin story, in my own words.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - the intended design and the invariants an implementation preserves.
- **[ROADMAP.md](ROADMAP.md)** - the staged build order.
- **[schema/](schema)** - the JSON Schemas.
- **[skills/](skills)** - the attachable agent skill that teaches a model to emit Mosaic; a template hosts edit to mirror their manifest.
- **[packages/](packages)** - the reference implementation (TypeScript).

## Built on

Mosaic stands on work that came before it:

- **[A2UI](https://a2ui.org)** - declarative local interaction driven by the client, not the network.
- **[MCP Apps / SEP-1865](https://modelcontextprotocol.io)** - the delivery transport Mosaic uses to reach a host.
- **[safe-mdx](https://github.com/remorses/safe-mdx)** - rendering JSX-shaped input as data.
- **[CEL](https://github.com/google/cel-spec)** and spreadsheet formulas - the bounded, safe expression model behind `expr`.

## Contributing

The scope and core design are kept tight while they take shape.
You're welcome to read, open an issue to discuss the design, or file a bug.
See [CONTRIBUTING.md](.github/CONTRIBUTING.md).
