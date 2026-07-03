# Spec backlog

This backlog is a **complete map of [the proposal](../docs/proposal.md)** - which _is_ the definition of the format.
Every capability the proposal describes has a row here.
Staging reflects **build order**, not scope: nothing in the proposal is deferred out of the format; the stages just say what has to work before what.

The whole backlog sits on one architecture: the model writes **Mosaic** (a JSX pattern), a compiler lowers it one-way to the **IR** (the canonical typed tree), and **frameworks** render the IR.
Two pillars run through it:

- **The language and the IR** - what the model writes, and the canonical form it compiles to. The IR is the public contract: it is what third parties build renderers against, and what we ship a TypeScript reference for.
- **The framework** - how any stack turns the IR into a surface (the `walk`/`NodeVisitor` contract), with `mosaic-react` as the worked example.

Each spec has (or will have) its own file here - for example [`0001-ir-node-shape.md`](0001-ir-node-shape.md) - following the house style in [`conventions.md`](conventions.md).
Status legend: `planned` · `draft` · `ready` · `in progress` · `done`.

## Stage 0 - The artifact compiles and renders

| #    | Spec                                                      | Proposal § | Package(s)   | Depends on       | Status  |
| ---- | --------------------------------------------------------- | ---------- | ------------ | ---------------- | ------- |
| 0001 | The IR - canonical node shape and contract                | §3.1, §4   | mosaic-core  | -                | planned |
| 0002 | The Mosaic language - JSX grammar and the compiler        | §5.1, §8   | mosaic-core  | 0001             | planned |
| 0003 | IR serialization, canonical form, and versioning          | §5.2, §5.3 | mosaic-core  | 0001, 0002       | planned |
| 0004 | The block registry (layout/content/control atoms)         | §4.1       | mosaic-core  | 0001             | planned |
| 0005 | The Host Manifest                                         | §3.3       | mosaic-core  | 0004             | planned |
| 0006 | The framework contract - `resolve`, `walk`, `NodeVisitor` | §3.2, §7.2 | mosaic-core  | 0001, 0004, 0005 | planned |
| 0007 | mosaic-react - the reference framework                    | §7.2       | mosaic-react | 0002, 0006       | planned |

**Exit:** a hand-written `.mosaic` source file compiles to the IR and renders in React through the host's own components, with no raw values in the artifact.

## Stage 1 - It is interactive

| #    | Spec                                                                          | Proposal § | Package(s)                | Depends on | Status  |
| ---- | ----------------------------------------------------------------------------- | ---------- | ------------------------- | ---------- | ------- |
| 0101 | Directives: `bind:state`, `from:state`, `on:event`                            | §6.1, §6.3 | mosaic-core, mosaic-react | 0002, 0007 | planned |
| 0102 | The `expr` language and `from:expr` / `if:show` / `for:each`                  | §6.2       | mosaic-core               | 0101       | planned |
| 0103 | mosaic-ansi - the text floor and `decomposeTo`                                | §7.2       | mosaic-ansi               | 0004, 0006 | planned |
| 0104 | Record-shaped state paths (`bind:state` paths, path writes, `for:each` index) | §6.1, §6.3 | mosaic-core, mosaic-react | 0101, 0102 | done    |

**Exit:** the egg-slider works end to end - a slider drives a derived total, a conditional shows itself, a button hands the host a computed intent - and the same artifact degrades to readable text.

## Stage 2 - It reaches an app

| #    | Spec                                                         | Proposal § | Package(s)              | Depends on | Status  |
| ---- | ------------------------------------------------------------ | ---------- | ----------------------- | ---------- | ------- |
| 0201 | MCP delivery: `ui://` resources, the bridge, intent relay    | §7.1       | mosaic-mcp              | 0007       | planned |
| 0202 | The security model (no-code, expr-safe, host intents, Embed) | §8         | mosaic-core, mosaic-mcp | 0102, 0201 | planned |

**Exit:** an interactive artifact from an MCP tool renders natively in a Mosaic-aware host and through the bridge in an unmodified MCP-Apps host, with every intent brokered by the host.

## Stage 3 - The full catalog

| #    | Spec                                                                                       | Proposal § | Package(s)                             | Depends on | Status  |
| ---- | ------------------------------------------------------------------------------------------ | ---------- | -------------------------------------- | ---------- | ------- |
| 0301 | Rich components and `decomposeTo` (DataTable, List, Tree, Board, Timeline, Calendar, Stat) | §4.3       | mosaic-core, mosaic-react              | 0006, 0007 | planned |
| 0302 | The visual model (`Chart` / `VegaChart` / `Canvas`)                                        | §4.3       | mosaic-core, mosaic-react              | 0301       | planned |
| 0303 | The host-macro mechanism                                                                   | §4.4       | mosaic-core                            | 0004       | planned |
| 0304 | The `Diagram` block (declarative nodes/edges/groups, renderer-owned layout)                | §4.3       | mosaic-core, mosaic-react, mosaic-ansi | 0301, 0104 | done    |

**Exit:** a chart-heavy dashboard and a filterable `DataTable` render on web and degrade cleanly to text, with all data carried in the artifact.

## Cross-cutting

| #    | Spec                                                                   | Proposal § | Package(s)  | Depends on | Status  |
| ---- | ---------------------------------------------------------------------- | ---------- | ----------- | ---------- | ------- |
| 0901 | Token-efficiency bake-off harness                                      | §9         | tools       | 0301       | planned |
| 0902 | Compiler-to-model loop, primer, CFG-constrained decoding, leakage eval | §5.1, §11  | mosaic-core | 0002       | planned |

The §9 numbers are _projections_; 0901 turns them into measured, regression-tracked figures against Thariq Shihipar's gallery.

---

To advance a spec: draft it to the house style, bump its status to `draft`, then `ready` once it's settled, then `in progress` when implementation starts.
Keep the `depends_on` graph honest - a spec shouldn't go `in progress` before the specs it depends on are at least `ready`.
