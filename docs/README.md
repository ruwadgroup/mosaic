# Mosaic docs

Mosaic is an open specification with a TypeScript reference implementation.
The [proposal](proposal.md) defines the format; the pages here document how to use it and how to implement it.
The reference libraries (`@mosaic/react`, `@mosaic/ansi`, `@mosaic/mcp`) are provided implementations, not the boundary of the format - any stack renders the same IR - and the block catalog and schemas are proposed defaults that evolve through the [design process](../.github/CONTRIBUTING.md#design-changes).

## Learn

- **[Getting started](getting-started.md)** - render an artifact in React and as text, theme it, swap in your own components, and route intents; five minutes.
- **[The agent skill](../skills/mosaic/SKILL.md)** - the attachable template that teaches an agent to emit Mosaic; hosts [edit it to mirror their manifest](../skills/README.md).
- **[Design history](design-history.md)** - the origin story: why Markdown is too thin, why HTML is the wrong endpoint, and the move that unlocked the design.

## Reference

- **[The language and the IR](language.md)** - the wire format: the mosaic-jsx grammar, the fence, the IR node shape, canonical serialization, and every compile error.
- **[The block catalog](blocks.md)** - every building block: layout, content, controls, structure, media, and data/viz, with decompose floors.
- **[State and events](interactivity.md)** - the state model, state paths, the directives, local mutations, and host intents.
- **[The `expr` language](expr.md)** - the bounded expression language: grammar, coercion rules, the full function catalog, and the limits.
- **[Rendering](rendering.md)** - the Host Manifest, `validate` / `resolve` / `walk`, the `NodeVisitor` contract, the provided React and ANSI libraries, and how to build a renderer for another stack.
- **[MCP delivery](mcp.md)** - `ui://` resources, the host-side seam, the MCP-Apps HTML bridge, and intent relay.

## Definition

- **[proposal.md](proposal.md)** - the full ground-up technical proposal.
  This is the definition of the format: every capability described here is in scope, and the specs cite it by section number.
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** - the intended architecture and the nine invariants an implementation must preserve.
- **[../ROADMAP.md](../ROADMAP.md)** - the staged build order (staging is _order_, not scope: the whole proposal is the target).
- **[../schema/](../schema)** - the normative JSON Schemas: the document, the Host Manifest, and the per-block prop schemas.
