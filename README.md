<div align="center">

# Mosaic

### AI thoughts, made visible

**Many of what you ask an agent for is really a picture.
Mosaic is a format that lets the agent build that picture from general blocks, and lets your app render it as native UI in your own look.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Proposal](https://img.shields.io/badge/proposal-founding-7c7cff.svg)](docs/proposal.md)
[![mosaic_version](https://img.shields.io/badge/mosaic__version-1.0--draft-7c7cff.svg)](docs/proposal.md)
[![Discussion](https://img.shields.io/badge/discuss-issues-blue.svg)](https://github.com/ruwadgroup/mosaic/issues)
[![GitHub stars](https://img.shields.io/github/stars/ruwadgroup/mosaic?style=flat&logo=github&label=star)](https://github.com/ruwadgroup/mosaic)
[![Follow @TamimBinHakim](https://img.shields.io/badge/follow-%40TamimBinHakim-000000?logo=x&logoColor=white)](https://x.com/TamimBinHakim)

</div>

A migration plan is a timeline with the risks beside it.
A build-versus-buy answer is a table that shifts depending on who's asking.
A pricing question is a slider you want to drag.
The agent has all of that in mind, then flattens it into paragraphs, because prose is the only thing it can hand your app.

Mosaic is a format for the picture that gets lost.
The agent arranges an interface out of general building blocks, the tiles, and your app draws them with its own components.
That's the name: small, general pieces the agent composes into whatever it needs to show you.

## The gap it fills

There are already two ways to get an interface out of an agent, and each makes you give something up.

You can build the components yourself and let the agent pick among them.
Safe, and it looks like your app, but the agent is stuck with the widgets you thought of first.
This is [A2UI](https://a2ui.org) and Vercel's generative UI: a catalog the agent chooses from but never composes beyond.

Or you can let the agent write real code and run it, the way Claude Artifacts and v0 do.
Now it can build anything, but what comes back is code: you run it in a sandbox, in a look you can't restyle, as a small app boxed inside a frame your product can't reach into.

Mosaic takes the good half of each.
The agent composes as freely as it would with code, but never writes code (or atleast not HTML,CSS,JS).
It writes a description made of general blocks, and that description is plain data your app renders with its own components.
So the agent invents anything, the result always looks like your product, and there's no sandbox, because there's nothing to run.

The interface is alive, too, without going back to the model.
A small, safe expression language lets a slider drive a total, a section appear when a value crosses a line, a list filter itself, all computed on the page.
Drag the slider and the price updates on the spot. No round-trip, no code.

## See it

The agent comparing memory layers.
Flip the audience at the bottom and the verdict rewrites itself, right there, with no trip back to the model.

```jsx
<Stack state={{ audience: "SaaS" }}>
  <Card>
    <Stack direction="horizontal">
      <Heading level={3}>Mem0</Heading>
      <Badge tone="warn">partial fit</Badge>
    </Stack>
    <Text>Fastest path to "it remembers things" - but recall quality drifts as the store grows.</Text>
  </Card>
  <Card>
    <Stack direction="horizontal">
      <Heading level={3}>Zep / Graphiti</Heading>
      <Badge tone="ok">strong fit</Badge>
    </Stack>
    <Text>Temporal knowledge graph. Leads on "what did we believe on the 8th?" - but you adopt a service, not a library.</Text>
  </Card>

  <SegmentedControl value={audience} options={["SaaS", "Bank"]} />
  {audience == 'SaaS' && (
    <Callout tone="ok">
      Zep wins here: point-in-time recall without a graph of your own to operate.
    </Callout>
  )}
  {audience == 'Bank' && (
    <Callout tone="warn">
      Neither survives an audit alone - provenance has to live in your own database.
    </Callout>
  )}
</Stack>
```

The agent never names a color.
It writes `tone="ok"`, and your app maps that to whatever green it already uses, so the verdict looks like it belonged there all along.

A pricing page whose numbers are real: drag the slider and the total recomputes as you go.

```jsx
<Card state={{ seats: 12, annual: true }}>
  <Field label={`Seats: ${seats}`}>
    <Slider value={seats} min={1} max={200} />
  </Field>
  <Toggle checked={annual} label="Bill annually (save 20%)" />
  <Stat
    label={annual ? "Billed today (12 mo)" : "Billed monthly"}
    value={formatCurrency(seats * 16 * (annual ? 12 * 0.8 : 1))} />
  {seats >= 100 && <Callout tone="warn">Above 100 seats, Enterprise usually wins.</Callout>}

  <Button variant="primary" onClick={startCheckout({
    seats: seats,
    total: seats * 16 * (annual ? 12 * 0.8 : 1)
  })}>
    Continue to checkout
  </Button>
</Card>
```

Everything but the click stays inside the page.
The click leaves as a plain event carrying the final total, and what happens next is your app's call.

## How it works

Two ideas, one line between them.

The agent writes **Mosaic** - standard, natural JSX - because writing JSX is second nature to a model and cheap in tokens.
Nothing in it executes: braces hold a bounded, interpreted expression subset, and the compiler lowers everything to plain data.
It compiles, one way, into an **IR**: a plain tree of data.
The IR is the real format, the thing you store and send and render against; the JSX is just the pen.

Your app renders every block with its own components, so `Card`, `Button`, and `Slider` look the way they do everywhere else in your product.
The agent writes names, never styles: `tone="warn"`, `variant="label"`, and your app decides what they mean.
The `expr` language covers derived values, conditions, and lists, and nothing more, so it computes but can't loop forever, reach out, or become a program.
It even renders while it's still streaming, the way the model streams a sentence.

We ship `mosaic-react` as the reference renderer, but any stack reads the same IR.
To draw Mosaic somewhere else, SwiftUI, Compose, Flutter, a terminal, you write a `NodeVisitor` against `mosaic-core`'s `walk()`; `mosaic-react` is the worked example.

| Package                                    | What it is                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`mosaic-core`](packages/ts/mosaic-core)   | The compiler and the IR, plus validate, resolve, the `expr` evaluator, streaming parsing, `walk()`, and the block registry.                        |
| [`mosaic-react`](packages/ts/mosaic-react) | The headless React runtime: `<Mosaic components onIntent>` turns the IR into React through the host's own components.                              |
| [`mosaic-ansi`](packages/ts/mosaic-ansi)   | A text renderer, and the fallback that lets any surface read a Mosaic even when it can't draw the rich version.                                    |
| [`mosaic-ai`](packages/ts/mosaic-ai)       | The AI tool adapters: neutral `mosaic_ls`/`mosaic_cat`/`mosaic_validate` descriptors, plus `/vercel`, `/mcp`, and `/prompt` bindings.              |

The artifact travels inline - a ```` ```mosaic ```` fence in the model's reply that the host's message renderer draws natively; MCP (or any tools API) carries only the three introspection tools.
[ARCHITECTURE.md](ARCHITECTURE.md) has the full design.

## Try it

```bash
pnpm install && pnpm build && pnpm demo
```

That opens the [demo](demo/): a full agent workspace where every reply is a live Mosaic, rendered by the app's own components.
The threads are real jobs, reviewing a diff, approving a command, picking a model, reading test results, and everything does something: sliders drive totals, filters reshape lists, buttons hand your app the numbers they computed.

If you'd rather read than run, [`examples/`](examples) has the hand-written files, one per job an agent actually does:

- [`compare-memory-layer.mosaic`](examples/compare-memory-layer.mosaic) - a product comparison that re-scores for your audience.
- [`pricing-estimator.mosaic`](examples/pricing-estimator.mosaic) - a pricing page where every figure is live.
- [`plan-migration.mosaic`](examples/plan-migration.mosaic) - a migration plan whose task list filters by owner.
- [`request-path.mosaic`](examples/request-path.mosaic) - an architecture flow you click through instead of read.
- [`network-waterfall.mosaic`](examples/network-waterfall.mosaic) - a page-load trace drawn as a real waterfall.

## Where to go next

- **[docs/react.md](docs/react.md)** - render your first artifact in about five minutes. The [docs index](docs/README.md) has the rest: the language, the blocks, state, `expr`, rendering, and MCP.
- **[docs/proposal.md](docs/proposal.md)** - the full proposal, and the definition of the format.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - the design and the invariants any implementation keeps.
- **[schema/](schema)** - the JSON Schemas. **[skills/](skills)** - the skill that teaches an agent to emit Mosaic. **[packages/](packages)** - the TypeScript reference.

## Standing on

- **[A2UI](https://a2ui.org)**, the closest neighbor: declarative, agent-driven UI rendered natively instead of run as code.
- **[Model Context Protocol](https://modelcontextprotocol.io)**, one of the tool transports that carry Mosaic's introspection tools to a model.
- **[safe-mdx](https://github.com/remorses/safe-mdx)**, which showed JSX-shaped input can be treated as plain data.
- **[CEL](https://github.com/google/cel-spec)** and spreadsheet formulas, the model behind a safe, bounded `expr`.

## Community

If Mosaic is useful to you, [**star the repo**](https://github.com/ruwadgroup/mosaic) - it helps others find it, and it tells me to keep building.
Follow [**@TamimBinHakim**](https://x.com/TamimBinHakim) on X for updates, and open a [discussion](https://github.com/ruwadgroup/mosaic/discussions) to talk through the design.

## Contributing

The scope and core design are kept deliberately tight while they settle.
You're welcome to read along, open an issue to talk through the design, or report a bug.
[CONTRIBUTING.md](CONTRIBUTING.md) has the details.
