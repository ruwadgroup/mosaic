# Contributing to Mosaic

Thanks for considering it.
This is a small project right now and the bar for contributions is mostly "is this making the format better, or making the implementation honest?" Both are welcome.

## Where to start

- **Read the proposal first** ([`docs/proposal.md`](docs/proposal.md)).
  Most disagreements in this space evaporate after a careful read.
  The ones that don't are the interesting ones.
- **Skim the examples** in [`examples/`](examples/).
  They're the shortest path to seeing what Mosaic _feels_ like.

> [!TIP]
> **Small fixes** (typos, broken links, doc nits) - just send a PR.
> **Big PRs** (new block, new directive, renderer port, wire-format change) - open an issue first.
> I'd rather discuss a 20-line direction than review a 2000-line PR I have to ask you to throw away.

## What kind of changes I'm looking for, in priority order

1. **Bug reports against the spec.**
   If something in the proposal is wrong, contradictory, or under-specified, that's the most valuable thing you can tell me.
   Cite the section number.
2. **Reference implementation work.**
   Start with `packages/ts/mosaic-core` (the compiler, registry, and `expr` evaluator) - it's the load-bearing piece.
   The `mosaic-react` runtime is the next priority.
   See [ROADMAP.md](ROADMAP.md) for the staged build order.
3. **Bake-off contributions.**
   A reproducible head-to-head against Thariq Shihipar's HTML gallery is the empirical question that decides whether Mosaic ships.
   If you want to help build that harness, I want to talk.
4. **Renderer ports.**
   A renderer for another stack - SwiftUI, Compose, Flutter, a TUI, email, Slack - written against the same IR, with `mosaic-react` as the worked example.
   Mosaic ships only the provided renderers; these live wherever their builder wants them.
5. **Doc improvements.**
   Examples that clarify, FAQ entries that head off recurring questions, prose that's tighter than mine.

## How to set up

The TypeScript packages are a pnpm workspace.
With Node >= 20 and pnpm >= 9, all commands run from the repo root unless otherwise noted:

```sh
pnpm install
pnpm build       # compile every package
pnpm test        # run the full test suite (vitest)
pnpm typecheck   # TypeScript type-check without emitting
pnpm check       # Biome lint + format check
pnpm gen         # regenerate blocks.gen.ts from the schema
```

Per-package equivalents (e.g. inside `packages/ts/mosaic-core`): `pnpm build`, `pnpm test`, `pnpm typecheck`.

After running `pnpm gen`, CI verifies the generated file is not stale:

```sh
pnpm gen && git diff --exit-code packages/ts/mosaic-core/src/blocks.gen.ts
```

Pre-commit hooks live in `lefthook.yml`.
Install with `lefthook install` (or `bunx lefthook install`).

## Coding conventions

- **JS/TS:** Biome handles both lint and format.
  The config is `biome.json`.
  Don't fight it; if you disagree with a rule, open an issue.
- Anything cross-file is governed by `.editorconfig`.
  Two-space indent for everything except Makefiles (which need tabs).

## Comments

Every file under `packages/ts/*/src` conforms to the following five rules.

1. **Every module opens with a role comment**: one to three sentences on what the module is and where it sits, citing the proposal section it implements (`docs/proposal.md §N`) when the behavior is normative.
   `resolve.ts` is the model.

2. **Every exported symbol carries a `/** */` contract**: what the caller can rely on and what the symbol expects - never how it is implemented.

3. **Inline comments state only what the code cannot show**: an invariant, a non-obvious choice and its reason, or a cross-file coupling ("mirror layout's filter so the metadata zips 1:1").
   If deleting the comment loses no information a maintainer needs, delete it.

4. **Banned outright**: narration of the next line; change history ("new in 0.6", "was gap-3"); reviewer-facing justification ("this is safe because we checked above"); commented-out code; decorative section dividers (`// --- Foo -------`); `TODO`/`FIXME`/`XXX` without a linked issue.

5. **Comments describe the present tense of the code.**
   A comment that only makes sense against a previous version is stale and is rewritten or removed.

## Commit messages

I follow Conventional Commits loosely.
The TL;DR:

- `feat: short summary` for new features.
- `fix: short summary` for bug fixes.
- `docs:`, `chore:`, `refactor:`, `test:` as appropriate.
- `spec:` for changes to the proposal text.

Anything that changes Mosaic, the IR, or a public API in a package needs a changeset (`pnpm changeset`).

## Design changes

Any change to an [invariant](ARCHITECTURE.md#invariants), the Mosaic grammar, the IR shape, the block registry, or the security model starts as a written proposal in an issue - before code.
The [proposal](docs/proposal.md) is the definition of the format and is re-cut only on a vision-level shift; every architectural decision cites it by section number.
New vocabulary or breaking format changes require a written spec that precedes any grammar or registry change, and the gate runs in order: proposal section citation, spec, grammar change, registry change, skill update.
Built-in blocks and host blocks use the same `defineBlockSchema` primitive; a block that cannot pass `createRegistry` cannot ship.

Once Mosaic has more than one implementation and a handful of users, such changes go through a numbered process modeled on MCP's SEP: a comment period, two implementations, and maintainer sign-off.
See [§11 of the proposal](docs/proposal.md#11-adoption) for the governance sketch.

For now (pre-v1), I'm batching changes.
If you're proposing something invasive, open an issue tagged `design-proposal` and we can talk about scope.

## A note on tone

I write this stuff in first person and try to be honest about tradeoffs and uncertainty.
If you contribute, I'd appreciate matching that - say what you mean, name the tradeoff, don't oversell.

## Code of conduct

See [CODE_OF_CONDUCT.md](.github/CODE_OF_CONDUCT.md).
The short version: be decent.
I'll moderate accordingly.

- Tamim
