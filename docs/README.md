# Mosaic docs

Mosaic is an **open specification** for the interfaces an agent produces, with a TypeScript reference implementation.
The two are documented separately, on purpose: the specification is framework-neutral - any stack renders the same IR - and the React library is one implementation of it.
The block catalog and schemas are proposed defaults that evolve through the [design process](../CONTRIBUTING.md).

Start here:

- Building an app with React? Read **[the React library](react.md)** - your first artifact in five minutes, then the full runtime reference.
- Implementing Mosaic on another stack, or evaluating the format? Read **the specification** below, starting with [the language](language.md) and [rendering](rendering.md).
- Want the why before the how? Read the **[proposal](proposal.md)**.

## The specification

Framework-neutral: the format, the contract every renderer implements, and how artifacts and schema knowledge reach a model.

- **[The language and the IR](language.md)** - the wire format: the mosaic-jsx grammar, the fence, the IR node shape, canonical serialization, and every compile error.
- **[The block catalog](blocks.md)** - every building block: layout, content, controls, structure, media, and data/viz, with decompose floors.
- **[Custom blocks and the registry](custom-blocks.md)** - `BlockDefinition`, `defineBlockSchema`, `createRegistry`, `expandsTo` macros, and teaching the model host vocabulary.
- **[State and events](interactivity.md)** - the state model, state paths, the directives, local mutations, and host intents.
- **[The `expr` language](expr.md)** - the bounded expression language: grammar, coercion rules, the full function catalog, and the limits.
- **[Rendering](rendering.md)** - the Host Manifest, `validate` / `resolve` / `walk`, the `NodeVisitor` contract, block precedence, and how to build a renderer for any stack.
- **[Delivery and AI tools](mcp.md)** - the fenced-artifact delivery model, the three introspection tools (`mosaic_ls`, `mosaic_cat`, `mosaic_validate`), and the `@mosaicjs/ai` adapters.
- **[The agent skill](../skills/mosaic/SKILL.md)** - the attachable template that teaches an agent to emit Mosaic; hosts [edit it to mirror their manifest](../skills/README.md).

## The React library

- **[The React library](react.md)** - install, first render, `<Mosaic>`, typed components with `defineComponents`, schema coercion, streaming, diagnostics, intents, and `defineBlock` for custom blocks.

## Definition

- **[proposal.md](proposal.md)** - the full ground-up technical proposal.
  This is the definition of the format: every capability described here is in scope, and the specs cite it by section number.
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** - the intended architecture and the nine invariants an implementation must preserve.
- **[../ROADMAP.md](../ROADMAP.md)** - the staged build order (staging is _order_, not scope: the whole proposal is the target).
- **[../schema/](../schema)** - the normative JSON Schemas: the document, the Host Manifest, and the per-block prop schemas.
