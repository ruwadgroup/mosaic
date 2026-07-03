# Delivery and AI tools

Mosaic needs no transport of its own.
The model emits the artifact **inline in its reply** - a ` ```mosaic ` fence in the ordinary message stream - and the host's message renderer detects the fence and renders it, the same seam where it already special-cases code blocks or images.
There is no render-over-MCP, no resource protocol, and no iframe: the artifact is text until your renderer draws it.

`@mosaicjs/ai` is the package that plugs the **introspection loop** into whatever agent runtime you use.
MCP is one adapter among several; what travels over it is tools, never renderings.

## Delivery: the fenced artifact

The model writes the artifact where its prose would go:

````text
Here is the estimator you asked for:

```mosaic v=1 id=pricing
<Card state={{ seats: 25 }}>
  <Slider label="Seats" min={1} max={200} value={seats} />
  <Stat label="Monthly" value={`$${seats * 16}`} />
</Card>
```
````

The host side is a fence handler in the message renderer: when a fence's language is `mosaic`, hand its text to your renderer with the message's streaming flag, and route the artifact's intents into your app.
[The React library](react.md) shows this wiring for the provided implementation.

Two properties make this work well:

- **Streaming.** The fence arrives token by token; `isStreaming` renders the prefix progressively, so the artifact assembles live instead of popping in at the end.
- **Stable ids.** The fence `id=…` is stable across regenerations: when the model emits a new version of the same artifact it reuses the id, and the host replaces the rendered tree instead of appending a second copy.

The model learns to emit this from the **skill** ([skills/mosaic](../skills/mosaic/SKILL.md)) or, where skills are unavailable, from `mosaicSystemPrompt()` below.

## The introspection tools

MCP's job in Mosaic is exactly three tools - `mosaic_ls`, `mosaic_cat`, `mosaic_validate` - and nothing else.
They are the product's core quality mechanism: the model lists blocks, reads their exact schemas, and validates a draft before emitting, so it never guesses a prop.

| Tool              | What it returns                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `mosaic_ls`       | the block catalog, one line each, grouped by kind; optional `kind` filter                    |
| `mosaic_cat`      | full prop schemas for one or more blocks (comma/space separated) plus a minimal example each |
| `mosaic_validate` | every compile and validation error for a draft, with fix hints - or confirmation it is sound |

They keep identical names, descriptions, and text outputs across every provider.
Every constructor takes an optional `registry` ([host vocabulary](custom-blocks.md)), so host-defined blocks appear in all three - and `mosaic_ls` marks host blocks `(host)`.

`@mosaicjs/ai` (root) exposes the framework-neutral descriptors:

```ts
import { mosaicToolDescriptors } from "@mosaicjs/ai";

const tools = mosaicToolDescriptors(); // or mosaicToolDescriptors(registry) to include host blocks
```

One subpath per provider style, each built from those same descriptors:

- **`@mosaicjs/ai/vercel`** - `mosaicTools(registry?)` returns an AI SDK `ToolSet`, ready to spread into `streamText`:

  ```ts
  import { mosaicTools } from "@mosaicjs/ai/vercel";

  const result = streamText({ model, tools: { ...mosaicTools() } });
  ```

- **`@mosaicjs/ai/mcp`** - `registerMosaicTools(server, registry?)` for the official `@modelcontextprotocol/sdk`, plus the raw descriptors for custom MCP servers.
- **`@mosaicjs/ai/prompt`** - `mosaicSystemPrompt(registry?)` returns the compact emission contract as a system prompt, for providers where tools are unavailable.
  It is generated from the same source as the skills, so the two never drift.

## The correction loop

The same `validate` that powers `mosaic_validate` runs in the host's renderer, and the two ends meet:

1. Before emitting, the model drafts and calls `mosaic_validate`; errors come back with paths and fix hints, and it repairs the draft.
2. After emitting, the host's `<Mosaic onDiagnostics>` surfaces anything that still slipped through - rendering is best-effort and never blanks, and the diagnostics feed back to the model as ordinary conversation, closing the loop.

## Keep the artifact source as the model's surface

The model's only surface is the mosaic-jsx pattern - never the IR.
When the model needs an existing artifact in context (to discuss, revise, or regenerate it), hand it the pattern: `serialize(doc, { format: "jsx" })`, or the block's `alt` when a mention is enough.
The jsx form is also the cheaper one, so the correct representation and the token-efficient one are the same choice.
