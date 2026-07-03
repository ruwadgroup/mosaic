# Roadmap

The strategy is deliberate: **get one interactive artifact rendering in a real host, then widen.**
The failure mode for a format like this is shipping a hundred components and a dozen renderers before a single artifact has rendered anywhere.
The winning move is a thin vertical slice - parse, validate, resolve, render, react to a click - then earning the right to grow the catalog.

This roadmap is a sequence of stages, not dates.
Each stage has an exit criterion that must be met before the next begins.
Staging is _order_, not scope: the whole [proposal](docs/proposal.md) is the target.

## Guiding wedge

**An interactive artifact, rendered in a real host, delivered over MCP.**
The egg-slider is the litmus test: a control drives a derived value, a condition shows itself, and a button hands the host a computed intent - all locally, with no code and no round-trip.
Get that rendering in one host, themed by that host, and the rest of the catalog has a floor to stand on.

---

## Stage 0 - The artifact renders

Parse, validate, resolve, render - static first, correctness over breadth.

- [x] `mosaic-core`: the IR, the Mosaic compiler (the JSX subset and its compile-time safety), and the IR's canonical JSON serialization.
- [x] Compilation and the `.mosaic` file: Mosaic source compiles to a valid IR, which serializes to canonical JSON byte-identically.
- [x] The block registry: the layout, content, and control primitives ([proposal §4.1](docs/proposal.md#41-the-block-catalog)).
- [x] The Host Manifest - capabilities and policy; semantic token names are the standard's, and their look is the renderer's.
- [x] `mosaic-react`: the reference web framework, resolving theme tokens through a native component registry.

**Exit criterion:** a hand-written `.mosaic` source file compiles to the IR and renders in React with the host's theme applied and no raw values anywhere in the artifact.

---

## Stage 1 - It is interactive

Add the reactive loop, so a control can drive a derived value locally.

- [x] Directives: `bind:state`, `from:state`, `on:event`.
- [x] The `expr` evaluator and `from:expr` / `if:show` / `for:each` - CEL-class, AST-interpreted, statically cost-bounded, no recursion, DAG-checked ([proposal §6](docs/proposal.md#6-interactivity)).
- [x] The `walk(doc, visitor)` contract and `mosaic-ansi` as the text/degraded floor via `decomposeTo`.

**Exit criterion:** the egg-slider works end to end - the slider drives a derived total, a conditional shows itself, and a button hands the host a computed intent - and the same artifact degrades to readable text.

---

## Stage 2 - It reaches an app

Deliver over MCP, keeping the core transport-independent.

- [x] `mosaic-mcp`: artifact-producing tools that return `ui://mosaic/*` resources (`application/vnd.mosaic+json`), the `text/html;profile=mcp-app` bridge for hosts that only speak MCP Apps, and the `on:event` intent relay under host policy.

**Exit criterion:** an interactive artifact produced by an MCP tool renders natively in a Mosaic-aware host and through the bridge in an unmodified MCP-Apps host, with every intent brokered by the host.

---

## Stage 3 - The full catalog

Widen from primitives to the rich components.

- [ ] The rich components with `decomposeTo`: `DataTable`, `List`, `Tree`, `Board`, `Timeline`, `Calendar`, `Stat`, `Chart`, `VegaChart`, `Canvas`.
- [ ] The host-macro mechanism (a host registers a name → primitive-subtree template, expanded before validation).

**Exit criterion:** a chart-heavy dashboard and a filterable `DataTable` render on web and degrade cleanly to text, with all data carried in the artifact.

---

## Cross-cutting

- [ ] The token-efficiency bake-off harness: re-emit Thariq Shihipar's HTML gallery as Mosaic and measure tokens, time-to-last-byte, and blind visual quality ([proposal §9](docs/proposal.md)).
- [ ] The validator-to-model feedback loop, the system-prompt primer, and - where the host controls the decoder - CFG-constrained decoding of the Mosaic grammar, with a subset-leakage eval.

## How this maps to specs

Each stage is decomposed into specs under [`specs/`](specs/) using the `/spec` workflow.
A spec must land and pass review before its implementation begins.
See [`specs/README.md`](specs/README.md) for the full backlog and [`specs/conventions.md`](specs/conventions.md) for the house style.

## Non-goals (for now)

- Being a Turing-complete artifact format. A live notebook, an in-artifact editor, or a game needs real code, and Mosaic refuses it (invariants 1-2). `<Embed>` is the escape hatch; MCP Apps already exists for that beast.
- Live data-binding. An artifact never pulls from a tool or resource on its own; its data is baked in (invariant 4).
- App-shell chrome. Modals, drawers, popovers, menus, command palettes, toasts, and global nav are the host's job; a Mosaic artifact is embedded content, not a standalone app.
- Shipping a renderer for every language. Mosaic ships one reference renderer (React) and a text floor; builders render the same AST on their own stack.
