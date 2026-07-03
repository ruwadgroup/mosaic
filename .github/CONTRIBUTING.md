# Contributing to Mosaic

Thanks for considering it. This is a small project right now and the bar for contributions is mostly "is this making the format better, or making the implementation honest?" Both are welcome.

## Where to start

- **Read the proposal first** ([`docs/proposal.md`](../docs/proposal.md)). Most disagreements in this space evaporate after a careful read. The ones that don't are the interesting ones.
- **Skim the examples** in [`examples/`](../examples/). They're the shortest path to seeing what Mosaic _feels_ like.

> [!TIP] > **Small fixes** (typos, broken links, doc nits) → just send a PR.
> **Big PRs** (new preset, new directive, renderer port, wire-format change) → open an issue first. I'd rather discuss a 20-line direction than review a 2000-line PR I have to ask you to throw away.

## What kind of changes I'm looking for, in priority order

1. **Bug reports against the spec.** If something in the proposal is wrong, contradictory, or under-specified, that's the most valuable thing you can tell me. Cite the section number.
2. **Reference implementation work.** Start with `packages/ts/mosaic-core` (the parser, registry, and `expr` evaluator) — it's the load-bearing piece. The `mosaic-react` reference renderer is the next priority. See [ROADMAP.md](../ROADMAP.md) for the staged build order and [`specs/`](../specs/) for the per-capability specs.
3. **Bake-off contributions.** A reproducible head-to-head against Thariq Shihipar's HTML gallery is the empirical question that decides whether Mosaic ships. If you want to help build that harness, I want to talk.
4. **Renderer ports.** A renderer for another stack - SwiftUI, Compose, Flutter, a TUI, email, Slack - written against the same AST, with `mosaic-react` as the worked example. Mosaic ships only the reference renderer; these live wherever their builder wants them.
5. **Doc improvements.** Examples that clarify, FAQ entries that head off recurring questions, prose that's tighter than mine.

## How to set up

The TypeScript packages are a pnpm workspace. With Node ≥ 20 and pnpm ≥ 9:

```bash
pnpm install
pnpm run check       # Biome lint + format check across all packages
pnpm run test        # Vitest across all packages
pnpm run build       # tsup build across all packages
```

Pre-commit hooks live in `lefthook.yml`. Install with `lefthook install` (or `bunx lefthook install`).

## Coding conventions

- **JS/TS:** Biome handles both lint and format. The config is `biome.json`. Don't fight it; if you disagree with a rule, open an issue.

Anything cross-file is governed by `.editorconfig`. Two-space indent for everything except Makefiles (which need tabs).

## Commit messages

I follow Conventional Commits loosely. The TL;DR:

- `feat: short summary` for new features.
- `fix: short summary` for bug fixes.
- `docs:`, `chore:`, `refactor:`, `test:` as appropriate.
- `spec:` for changes to the proposal text.

Anything that changes Mosaic, the IR, or a public API in a package needs a changeset (`pnpm changeset`).

## Spec process

The format is spec-first: any change to an [invariant](../ARCHITECTURE.md#invariants), the Mosaic grammar, the IR shape, the primitive or preset registry, or the security model starts as a written spec under [`specs/`](../specs/) — see [`specs/conventions.md`](../specs/conventions.md) for the house style. The [proposal](../docs/proposal.md) is re-cut only on a vision-level shift; features land as specs.

Once Mosaic has more than one implementation and a handful of users, such changes go through a numbered spec modeled on MCP's SEP process: a comment period, two implementations, and maintainer sign-off. See [§12 of the proposal](../docs/proposal.md#12-adoption) for the governance sketch.

For now (pre-v1), I'm batching changes. If you're proposing something invasive, open an issue tagged `spec-proposal` and we can talk about scope.

## A note on tone

I write this stuff in first person and try to be honest about tradeoffs and uncertainty. If you contribute, I'd appreciate matching that — say what you mean, name the tradeoff, don't oversell.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). The short version: be decent. I'll moderate accordingly.

— Tamim
