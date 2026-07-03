# Mosaic spec conventions

Mosaic is designed-in-the-open and spec-first: any change that touches an [invariant](../ARCHITECTURE.md#invariants), the Mosaic grammar, the IR shape, the primitive/preset registry, or the security model starts as a written spec **before** code.
Specs are authored with the `/spec` workflow and live in [`specs/`](.).
This file is the house style for those specs.

## What a spec is for

A spec is a portable, self-contained document an implementer (human or agent) can execute top-to-bottom without rediscovering context.
It pins down _what_ and _why_ and the acceptance bar; it leaves room for _how_ where the how is genuinely the implementer's call.

## Each spec should contain

1. **Problem** - the concrete pain, in terms of the format or a user scenario.
   Not the solution.
2. **Goals / non-goals** - what success is, and explicitly what this spec does not cover.
3. **Model impact** - which invariants, AST fields, primitives, presets, or directives this touches.
   If it touches an [invariant](../ARCHITECTURE.md#invariants), say how it preserves it.
4. **Design** - the proposed approach.
   Show the IR shapes, the Mosaic grammar, the schema, the manifest fields, or the MCP messages where relevant.
5. **Package(s) affected** - `mosaic-core` / `mosaic-react` / `mosaic-mcp` / `mosaic-ansi`, and the dependency direction.
6. **Acceptance criteria** - observable and testable.
   Prefer "Mosaic source compiles to the expected IR, and the IR serializes to canonical JSON byte-identically" over "it works."
7. **Test plan** - unit, property, and (for the parser, validator, and MCP bridge) adversarial tests.
   Correctness-critical paths need adversarial tests, not just happy paths.
8. **Risks & open questions** - call out the unknowns honestly.

## Frontmatter

Every spec opens with YAML frontmatter so the backlog and tooling can read it:

```yaml
---
id: 0001
title: The IR - canonical node shape and contract
slug: 0001-ir-node-shape
stage: 0
status: draft
packages: [mosaic-core]
proposal_sections: ['§3.1', '§4']
depends_on: []
invariants: [4, 5]
---
```

Status legend: `planned` · `draft` · `ready` · `in progress` · `done`.

## Conventions

- One spec = one reviewable unit of work.
  If it can't be reviewed in one sitting, split it.
- Reference invariants by number from [`ARCHITECTURE.md`](../ARCHITECTURE.md#invariants).
- Reference proposal sections by `§` number; the [proposal](../docs/proposal.md) keeps its numbering stable so citations hold.
- A spec that weakens an invariant must be tagged `proposal` and get maintainer sign-off.
- Keep performance claims labelled as projections until the bake-off harness ([0901](README.md)) measures them.
- In prose, put each full sentence on its own line; it keeps diffs clean, which is the same value the format itself is chasing.

## Index

See [`README.md`](README.md) for the staged spec backlog, one row per capability in the proposal.
