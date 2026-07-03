---
id: 0104
title: Record-shaped state - path binds, path writes, and the for:each index
slug: 0104-record-state-paths
stage: 1
status: done
packages: [mosaic-core, mosaic-react]
proposal_sections: ['§6.1', '§6.3']
depends_on: [0101, 0102]
invariants: [1, 2]
---

# 0104 - Record-shaped state: path binds, path writes, and the `for:each` index

## Problem

Mosaic's local state is nested on paper but flat in practice.
The `expr` evaluator already reads nested values (`files[2].checked` evaluates today), the compiler already lowers nested `state={{...}}` literals, and `mosaic-v1.schema.json` already documents `bind:state` as a dotted path - but the resolver and every write path treat the bind target as one flat key.
The consequence shows in real artifacts: a checkbox-per-row list needs hand-numbered keys (`f1..f5`) and expressions that enumerate them literally.
That wastes tokens, does not scale past a handful of rows, and blocks the most common interactive artifact shapes: per-row selection, scenario toggles, and selection-driven detail panels.

## Goals / non-goals

Goals:

- `bind:state` / `from:state` accept a **state path** - an identifier followed by member and index segments - and read/write through it.
- `for:each` gains an optional zero-based index binding (`"files as f, i"`) so per-row paths like `files[i].checked` can be authored.
- `state.set` / `state.toggle` accept the same paths.
- Bad paths fail validation with a dedicated error code (`INVALID_STATE_PATH`).

Non-goals:

- No `expr` grammar or evaluator changes; member/index reads already exist and are reused as-is.
- No dependency DAG or incremental recompute; whole-tree re-resolve stays the reactivity model.
- No implicit structure creation on writes; the authored `state={{...}}` is the schema.
- No streaming, re-emission, or state-snapshot work.

## Model impact

- **Directives** `bind:state`, `from:state` (§6.1): the value is now normatively a path, not a flat key.
- **Directive** `for:each` (§6.1): grammar gains the optional `", index"` second binding.
- **Actions** `state.set` / `state.toggle` (§6.3): the key argument is a path.
- **AST/IR**: no shape change.
  Directives remain opaque strings in the stored IR; concrete paths exist only in the resolved (runtime) tree.
- **Invariant 1** (no executable code): preserved by construction - paths introduce no new brace syntax and no new call forms; a path is parsed by the existing compile-time-safe machinery.
- **Invariant 2** (`expr` safe by construction): preserved by construction - `[expr]` index segments reuse the existing bounded, AST-interpreted evaluator with its existing cost limits.
  No invariant is weakened, so this spec carries no `proposal` tag.

## Design

### Grammar

```ebnf
path    = ident segment* ;
segment = "." ident
        | "[" expr "]" ;      (* expr evaluates to an int (array) or string (record) *)
```

A path is exactly an `expr` AST consisting only of `ident`/`member`/`index` nodes rooted at an identifier - parsed with the existing expr parser, then shape-checked.
No method calls, no arithmetic outside `[...]`, no leading literals.

### Semantics

| Operation | Rule |
| --------- | ---- |
| Read | Identical to expr member/index evaluation; a missing segment yields `null`. |
| Index resolution | `[expr]` segments are evaluated once, at resolve time, against the current scope - including `for:each` loop variables - producing a **concrete path** (e.g. `files[2].checked`). The resolved tree carries the concrete path so renderers close over it. |
| Write | Copy-on-write deep set along the concrete path: clone every container on the path, assign the leaf. Never mutate in place - `initialState` shares references and resolve must stay pure. |
| Missing containers | A write through a missing or mismatched container is a no-op plus a dev `console.warn`. Writes never invent structure. |
| `state.set` / `state.toggle` | Accept the same path grammar: `state.set('data.view', 'grid')`, `state.toggle('files[2].checked')`. |
| Non-interactive renderer | Unchanged: path binds are ignored exactly like flat binds. |

### `for:each` index binding

`for:each="EXPR as item"` gains an optional `", index"` second binding.
The index identifier is bound to the zero-based position in the materialized array, in the same per-iteration scope that binds the item.

```jsx
<Stack for:each="files as f, i">
  <Checkbox bind:state="files[i].checked" label={expr("f.path")} />
</Stack>
```

### Core API (mosaic-core, `state-path.ts`)

```ts
parseStatePath(source: string): StatePath                      // throws on bad shape (INVALID_STATE_PATH)
resolveStatePath(path: StatePath, scope: StateScope): string   // eval index exprs -> concrete path
readStatePath(scope: StateScope, concrete: string): ExprValue
writeStatePath(scope: StateScope, concrete: string, value: ExprValue): StateScope  // copy-on-write
```

`resolve` uses parse/resolve/read for `bind:state` / `from:state` and rewrites the directive to the concrete path on the resolved node only; the stored IR is never rewritten (invariant 9's canonical serialization is untouched).
`mosaic-react` replaces its flat `setKey` with `writeStatePath` and routes `state.set` / `state.toggle` through the same helpers.
`validate` gains an `INVALID_STATE_PATH` error for `bind:state` / `from:state` strings that do not parse as a path.

### Reactivity

Unchanged.
The runtime model remains "any state change re-resolves the whole document"; there is no dependency DAG, so path writes need no invalidation logic.

## Package(s) affected

- `mosaic-core`: the `state-path` module, resolver path reads and concrete-path rewriting, the `for:each` index binding, `INVALID_STATE_PATH` validation.
- `mosaic-react`: path-based state writes (`setKey` replacement, `state.set` / `state.toggle` dispatch, `useBindable`, the custom-component bridge).
- Dependency direction unchanged: `mosaic-react` depends on `mosaic-core`, never the reverse.

## Acceptance criteria

- `bind:state="files[i].checked"` inside `for:each="files as f, i"` resolves each instance to a concrete path (`files[0].checked`, `files[1].checked`, ...) in the resolved tree, while the stored IR keeps the authored string.
- A checkbox bound to `files[i].checked` toggles exactly its own row, and a derived `sum(map(files, f, f.checked ? 1 : 0))` recomputes.
- `writeStatePath` returns a new scope in which every container on the written path is a fresh clone and every untouched sibling keeps reference equality.
- A write through a missing container leaves the scope unchanged and warns once.
- Malformed paths (method calls, leading literals, arithmetic outside `[...]`) fail validation with `INVALID_STATE_PATH`.
- Documents using nested state still serialize to canonical JSON byte-identically before and after resolve.

## Test plan

- Unit: path parse accept/reject tables (dotted, indexed, mixed; rejects `a.b()`, `1.a`, `a + b`).
- Unit: read/write round-trips, copy-on-write identity checks, missing-container no-op.
- Unit: `for:each` index binding in scope; resolve rewrites directives to concrete paths.
- Adversarial: index expressions at the expr cost bounds; paths targeting non-container leaves; toggling a non-boolean leaf; writes racing re-resolve (whole-tree recompute must stay consistent).
- Integration (jsdom): per-row checkboxes re-derive a computed label; `state.set` with a path from `on:event`.

## Risks & open questions

- Copy-on-write bugs are the main correctness risk: an in-place mutation would corrupt `initialState` (shared references) and break resolve purity.
  The identity-check tests exist to pin this.
- Index expressions evaluated at resolve time mean a stale index after array-shape changes; arrays are baked-in and never resized at runtime today, so this is theoretical, but worth restating if re-emission lands.
- The dev-only `console.warn` on missing containers is deliberately not an error; whether validation should statically check paths against the authored `state` shape is left open (it cannot be complete once indices are dynamic).
