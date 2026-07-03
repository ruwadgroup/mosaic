# Changelog

All notable changes to Aria (the spec, the reference implementations, the docs) live here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Spec versions follow the RFC; package versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Initial repo scaffolding: `spec/`, `docs/`, `examples/`, `packages/ts/*`, native renderer placeholders for SwiftUI / Compose / Flutter.
- RFC 0001 — Aria v1.0 (draft): three-layer architecture, ~16 primitives, ~25 presets, 8 directives, three-tier visual model, six renderer capability tiers.
- Biome (TS/JS/JSON), SwiftFormat + SwiftLint (Swift), ktlint (Kotlin), `dart format` (Dart), lefthook pre-commit pipeline.
- GitHub Actions CI scaffolding for TS + Swift + Kotlin + Dart workspaces.
- Worked examples mirroring §11 of the RFC: `plan-q3-launch.aria`, `mmap-billing.aria`, `triage-now.aria`, `ds.aria`, `anim.aria`, `deck-q3.aria`, `growth.aria`, `inc-2026-05-08.aria`.

### Changed

- **GitHub-flavored rendering pass.** Added README badges (spec / version / license / status / discuss). Replaced ASCII diagrams with Mermaid in `spec/RFC-0001-aria.md` (§3.1 three layers, §7.1 five-stage pipeline) and `docs/architecture.md`. Added GitHub alert callouts (`> [!NOTE]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!TIP]`) on the load-bearing claims: the "opinionated personal RFC" note in the Abstract, the §1.3 "most willing to be wrong" admission, the §3.4 trust boundary, the §4.3 alt-text requirement, the §10.1 "grading my own homework" caveat, and the §13.1 "call I'd most regret" risk. Collapsed the 25-preset table in §4.4 into a `<details>` drawer so the RFC skims better. Added an architecture Mermaid diagram to the README. Added security/contributing callouts. Tone and content unchanged.

- **RFC 0001 voice pass.** Rewrote Abstract, §1 (Motivation), §2 (What Aria Looks Like) intro, §3 (Architecture) intro, §8.1 framing, and Closing in first-person opinionated voice; added an explicit "this is an opinionated personal RFC" note to the Abstract. Softened the most centric claims: §1.3 no longer says "Aria is the first format to keep all four orthogonal by construction" (now "I tried to keep them orthogonal, whether I succeeded is what this document tries to argue"); §10.1 scorecard now opens with a prominent "Reader, this is me grading my own homework" caveat pointing readers to §2/§11/§9 as the actual evidence; §6.4 visualizer pattern, §13.6 coexistence framing, and the Closing all rephrased to "what I want" rather than "what Aria is." Technical schemas, tables, code samples, and MUST/MAY/MUST NOT normative language unchanged.

- **RFC 0001 restructure.** Merged old "Part N" structure into 14 single-digit sections. Moved worked examples up to §2 (show before tell). Merged Runtime into Renderers (§7). Reordered Motivation to lead with format survey + design goals before architecture. Collapsed §13 from 13 sub-risks to 7 clusters. Added a short first-person preface; rest stays formal spec voice. Reconciled the 15-vs-16 primitive count (now consistently 16). Removed 218 non-breaking hyphens, 3 HTML-escaped ampersands, and 14 duplicate Part headings. Updated all doc/README anchor references to match the new section numbers.

### Notes

- No package has a real implementation yet — everything in `packages/` is a typed stub. The Stage-1 PoC (parser + 5-preset React renderer + bake-off) lands as the first feature commit.
