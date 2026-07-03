# `tools/` — repo tooling

Scaffolds for the small CLIs the project will eventually need. Empty today — each lands as a separate PR with its own tests.

## Planned

- **`mosaic-canonical.mjs`** — read a `.mosaic` source file, compile it via `@mosaic/core`, and verify it produces a valid IR (whose JSON serialization is canonical). Used by the lefthook pre-commit hook (`lefthook.yml`). Also as a standalone CLI: `node tools/mosaic-canonical.mjs --check examples/*.mosaic`.
- **`bakeoff/`** — the head-to-head harness behind the §9 token tables (spec 0901). Takes a prompt, runs HTML + Mosaic heads, scores both on (a) token count, (b) visual quality via a blind A/B rater panel, (c) reviewability (count of explicit user actions per artifact).
- **`token-count.mjs`** — wrap `tiktoken` (`o200k_base`) for the spec's token tables (§9). One-shot CLI: `node tools/token-count.mjs examples/compare-memory-layer.mosaic`.
- **`fixture-gen.mjs`** — compile Mosaic source into IR fixtures (serialized as JSON) for compiler and renderer tests.

## Running

The tools live in the pnpm workspace so they can import the `@mosaic/*` packages directly.

```bash
pnpm install
node tools/mosaic-canonical.mjs --check examples/
node tools/token-count.mjs examples/*.mosaic
```
