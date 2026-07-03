# Architecture

This document describes how Mosaic is designed and the invariants that design must preserve.
It is the companion to the [README](README.md) (the _what_) and the [ROADMAP](ROADMAP.md) (the _when_).

> The reference implementation in [`packages/`](packages/) implements this architecture; the invariants below are enforced under test.
> Where a decision is still open it is marked **(open)**.

## Who Mosaic is for

Mosaic is builder-facing infrastructure: it is for the people building AI apps - Claude Code, t3-code, Codex, Cursor, and the like - not for end users.
A builder brings their own renderer and their own aesthetic.
Mosaic gives their agent general building blocks and a safe expression language to compose any interface, one reference framework to copy from, and an optional way to deliver the interface into the app over MCP.

## What Mosaic moves

Two things, and one contract between them.

- **Mosaic** is a JSX pattern - the one surface the model writes to.
- **The IR** is the canonical typed tree that Mosaic compiles to - the format's identity, and the contract every renderer builds against.

```text
IR node = { kind, type, props, directives, children, key, slots? }
```

Compilation is one-directional: the model emits Mosaic, the compiler lowers it to the IR, and the IR renders everywhere.
The IR serializes losslessly to and from JSON for storage and transport; nobody authors that JSON by hand.
This mirrors Pandoc's `reader -> IR -> writer` pipeline: one language in, one canonical tree, many writers out.

We ship the reference compiler and one renderer in TypeScript.
Anyone building for another stack - SwiftUI, Compose, a TUI, email, Slack - builds their framework against the **IR**, not against the JSX.

## The three layers

```text
        Model (untrusted)
            │ writes Mosaic (the JSX pattern)
            ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  Mosaic      the JSX pattern the model emits - the only authored surface
        ├────────────────────────────────────────────────────────────────┤
        │  IR          one canonical typed tree; the format's identity and the
        │              renderer contract (serialized to JSON for storage and MCP)
        ├────────────────────────────────────────────────────────────────┤
        │  Frameworks  mosaic-react (reference) · mosaic-ansi (text floor) ·
        │              bring your own - always against the IR
        └────────────────────────────────────────────────────────────────┘
            │ every action handed to
            ▼
        Host (trusted)
```

- **Mosaic - the language.** A strict JSX subset, the token-cheapest and most fluent surface for a model to emit component trees. It is the only thing anyone authors.
- **The IR - the contract.** One node type, a record with deterministic key ordering. Mosaic compiles to it; every renderer consumes it; it serializes to JSON for storage and MCP delivery. Compilation is one-way: `Mosaic -> IR`.
- **Frameworks - the renderers.** Consume the IR and render every component with the host's own implementation - one host-native output, resolving theme tokens along the way. `mosaic-react` is the reference we ship; a builder writes their own for another stack against the `walk()` contract - always against the IR, never against the JSX.

## The pipeline

```text
compile   →  validate  →  resolve  →  render  →  dispatch
(Mosaic      (registry ×   (expr       (host      (local state.* / expr;
 -> IR)       manifest)     eval)       VDOM)      host intents to the host)
```

The first four stages are pure functions of their input.
Only `dispatch` reaches outside the artifact: it applies local state mutations and derived-expression updates, and hands `on:event` host intents to the host under its policy.

## Package boundaries

Four packages; each depends only on the layers below it.

```text
mosaic-react (reference) · mosaic-ansi (text floor)
        │            (frameworks for the IR)
        ▼
mosaic-mcp (optional delivery)  ──→  mosaic-core
                                    (Mosaic compiler · the IR · validate · resolve · expr · walk · registry · manifest)
```

| Package        | Responsibility                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mosaic-core`  | The Mosaic compiler (`Mosaic -> IR`); the IR types; `validate`; `resolve`; the `expr` evaluator; `walk`; the block registry; the Host Manifest. No I/O. The one package everything depends on.           |
| `mosaic-react` | The reference web framework: `render(source, opts)` and the React `NodeVisitor` over the IR.                                                                                                             |
| `mosaic-mcp`   | Optional delivery: `ui://` artifact resources, the MCP-Apps HTML bridge, and `on:event` intent relay.                                                                                                    |
| `mosaic-ansi`  | The text/degraded framework and the `decomposeTo` floor.                                                                                                                                                 |

`mosaic-core` absorbs what were separate `mosaic-wire`, `mosaic-schema`, and `mosaic-host` packages; there is no separate `mosaic-presets` package because Mosaic ships no templates.
A builder targeting SwiftUI, Compose, Flutter, a TUI, email, or Slack writes a framework against the same IR via `walk()`; `mosaic-react` is the worked example.
The normative JSON Schemas live in [`schema/`](schema/): `mosaic-v1.schema.json`, `host-manifest.schema.json`, `primitives.schema.json`.

## Invariants

These are the guarantees every implementation must preserve.
A change that weakens one is a `proposal`-tagged spec, not an ordinary spec (see [specs/conventions.md](specs/conventions.md)).
Specs and the proposal reference them by number.

1. **Mosaic cannot express executable code.**
   Braces admit only JSON-compatible literals plus two whitelisted calls, `token(...)` and `expr(...)`; both are interpreted, neither is executed as code.
   Arrow functions, identifiers, member access, template literals, and lowercase HTML tags are rejected at compile time.

2. **`expr` is safe by construction.**
   The expression language is CEL-class - non-Turing-complete, terminating, side-effect-free - AST-interpreted (never `eval`), statically cost-bounded, with recursion and user-defined functions forbidden and circular derivations rejected as DAG cycles.

3. **Every action is the host's.**
   An `on:event` hands the host a named intent; the host decides whether and how to act, under its own policy.
   The artifact cannot reach the network, call a tool, or navigate on its own, and the model never sees credentials.

4. **No live data-pull.**
   An artifact's data is baked in when the model produces it; nothing subscribes or re-fetches.

5. **One canonical IR; Mosaic lowers to it.**
   Mosaic - the JSX pattern - compiles to a single canonical typed tree, the IR.
   The IR is the format's identity and the contract every renderer targets; it serializes losslessly to and from JSON.
   Compilation is one-directional: `Mosaic -> IR` is the only path in, and nobody hand-authors the IR.
   The model never touches the IR in either direction: it neither emits mosaic-json nor receives it - everything model-facing (prompts, skills, tool results echoed into context) carries the Mosaic pattern.

6. **The host owns the design.**
   Every component is rendered by the host's own renderer, and artifacts reference tokens (`token("color.accent")`, `tone="warn"`), never raw values (`#d97706`).
   The model composes from the standard vocabulary; it cannot ship a foreign look.

7. **Every visual block carries `alt`.**
   `Image`, `Video`, and the charts fail validation without it.

8. **Rich components decompose to primitives.**
   Every rich component carries a normative `decomposeTo` recipe, so a renderer that does not support it renders the primitive expansion instead.

9. **The IR serialization is diffable.**
   The IR has a canonical, deterministic JSON serialization - fixed key order, stable `key`s, and the fenced `id` - so two regenerations of the same artifact diff cleanly.

## Renderer capabilities

A renderer declares in its manifest whether it is **interactive** and which rich components it supports (`components_supported`).
Two rules keep one artifact working everywhere: an unsupported rich component renders its `decomposeTo` expansion, and a non-interactive renderer renders controls in their default state and ignores `bind:state`, `from:expr`, `if:show`, and `on:event`.

## Delivery: how an artifact reaches an app

The core is transport-independent - `render(source)` needs no MCP.
For interop, an artifact-producing MCP tool returns the **IR** as an embedded resource:

- **Mosaic-aware host.** The tool returns `mimeType: application/vnd.mosaic+json`; the host renders the IR through its own framework and its own components - no iframe. This mirrors how a native host (e.g. an ACP-based coding app) renders a typed plan today.
- **MCP-Apps host that does not know Mosaic.** The tool additionally returns a `text/html;profile=mcp-app` runtime that renders the same IR inside the sandbox.

SEP-1865's `mimeTypes` list is open and `_meta.ui.resourceUri` is mimeType-agnostic, so `application/vnd.mosaic+json` is a legitimate extension, not a fork.
The same IR is a rendered view, a stored artifact, and an MCP resource.

## The trust boundary

The boundary sits between the **model + artifact** (untrusted) and the **host** (trusted).
Invariants 1-4 hold across it by construction: there is nothing executable to sandbox, the expression language is provably bounded, no authority lives in the artifact, and no live channel leaves it.
The one exception is `<Embed src="...">`, an explicit arbitrary-iframe escape hatch, gated by host consent and denied by default.

## Where decisions are still open

- The real-world **subset-leakage** rate (a model emitting `{eggs*2}`, `.map`, or `className`) is unmeasured; close it mechanically (CFG-constrained decoding + the compile-time validator) and measure it. **(open)**
- The exact `expr` function catalog and where the static cost bound sits. **(open)**
- Whether host macros want a shared registry format or stay fully host-private. **(open)**
- Whether the streaming compiler needs a chunked envelope for very large artifacts. **(open)**
