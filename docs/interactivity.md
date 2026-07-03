# State and events

Interactivity in Mosaic is **local and reactive** ([proposal §6](proposal.md#6-interactivity)).
An artifact's data is baked in when the model produces it; what it has is a client-side loop - state, derived values, conditionals, lists - that needs no round-trip, plus one explicit door to the host: named intents.
This page covers the state model, the directives, and events.
The expression language they all lean on has [its own reference](expr.md).

## The state model

The root element declares the artifact's state as a plain JSON literal:

```jsx
<Stack state={{ seats: 12, annual: true, files: [{ path: "a.ts", checked: false }] }}>
```

That literal is **the schema**: reads of missing state yield `null`, and writes never invent structure ([details below](#state-paths)).
Every state change re-resolves the whole document: derived values, `if:show`, and `for:each` all recompute from the new scope.
There is no dependency graph to manage and no partial invalidation to get wrong.

## State paths

Anywhere Mosaic takes a state key it takes a **state path** ([proposal §6.1](proposal.md#61-state-derived-values-conditionals-lists)):

```ebnf
path    = ident segment* ;
segment = "." ident | "[" expr "]" ;
```

`seats`, `filters.region`, and `files[i].checked` are all well-formed.
An `[expr]` index is evaluated **once, at resolve time**, against the current scope - including `for:each` loop variables - producing the concrete path the renderer reads and writes (`files[2].checked`).
The stored IR keeps the authored path; only the resolved tree carries the concrete one.

Reads follow `expr` member/index semantics: a missing segment yields `null`.
Writes are copy-on-write along the path and touch nothing else; a write through a missing or mismatched container is a no-op with a dev warning.
New keys are allowed on an existing record; array writes accept in-range indices only.
A path that is not `ident`/member/index-shaped (a call, arithmetic outside `[…]`, a leading literal) fails validation with `INVALID_STATE_PATH`.

## The directives

| Directive     | Value                                   | What it does                                                           |
| ------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `bind:state`  | state path                              | Two-way binds a control: the path fills the value, edits write it back |
| `from:state`  | state path                              | Read-only: fills the node's `value` from the path                      |
| `from:expr`   | expression                              | Derived value: fills `value` with the expression's result              |
| `if:show`     | boolean expression                      | Renders the subtree only while the expression holds                    |
| `for:each`    | `"EXPR as item"` or `"EXPR as item, i"` | Instantiates the subtree once per item of the materialized array       |
| `on:event`    | `{ event: action }` map                 | Fires an action on an event - see [Events](#events)                    |
| `key`         | string or `expr("…")`                   | Stable identity for list-child diffing                                 |

Three more names - `theme:scope`, `slot:name`, `from:ref` - are reserved in the grammar for future capabilities and carry no semantics yet; do not write them.

### Binds

```jsx
<Slider bind:state="seats" min={1} max={200} />
<Stat from:expr="seats * 16" label="Monthly" />
<Text from:state="plan.name" />
```

A control without a bind still works - it runs on renderer-local state, so a mock stays a live mock; it just cannot drive anything else.
`bind:state` fills the control's value only when the path exists in the declared state; the authored `value` prop is the fallback.

### Conditionals

```jsx
<Callout if:show="seats >= 100" tone="warn">
  Above 100 seats, Enterprise usually wins.
</Callout>
```

`if:show` takes a bare expression string (not `expr("…")` - the directive value is already an expression).
[Truthiness](expr.md#coercion-and-comparison) is expr's: `null`, `false`, `0`, `""`, and the **empty array** are false.

### Lists

```jsx
<Stack for:each="files as f, i">
  <Checkbox bind:state="files[i].checked" label={expr("f.path")} />
</Stack>
```

`for:each` iterates any expression that materializes an array - a state array, or a derived one: `for:each="filter(tasks, t, t.owner == who) as task"`.
The item binding (and the optional zero-based index binding) join the scope for everything inside the subtree, including `[index]` path segments - which is what makes per-row binds work.
Set `key` on repeating children when items can reorder, so renderers diff by identity rather than position.

## Events

`on:event` maps event names to actions.
An action is one of exactly two things ([proposal §6.3](proposal.md#63-events)):

**A local state mutation** - applied by Mosaic to its own store, no round-trip:

```jsx
<Button on:event={{ click: "state.set('view', 'grid')" }}>Grid</Button>
<Button on:event={{ click: "state.toggle('files[2].checked')" }}>Toggle</Button>
```

`state.set(path, value)` takes a path and a **literal** value - `true`, `false`, `null`, a number, or a quoted string.
To hand over a computed value, use an intent with `expr` args, or bind the control instead.
`state.toggle(path)` negates the boolean at the path.

**A named host intent** - handed to the host, and that is where Mosaic stops:

```jsx
<Button
  tone="primary"
  on:event={{
    click: {
      action: "startCheckout",
      args: { seats: expr("seats"), total: expr("seats * 16 * (annual ? 12 * 0.8 : 1)") },
    },
  }}
>
  Continue to checkout
</Button>
```

The host's `onAction(action, args)` receives the intent.
`expr` values in `args` are resolved against current state **before** dispatch, so the host receives the computed total, never a raw expression or stale state.
What the intent means - call a tool, start a turn, navigate - is entirely the host's policy ([invariant 3](../ARCHITECTURE.md#invariants)).

Anything that is not `state.set(…)` or `state.toggle(…)` dispatches as an intent, so `on:event={{ click: "refresh" }}` is shorthand for `{ action: "refresh" }`.

## Non-interactive surfaces

A host whose manifest says `interactive: false` (email, plain text) renders controls in their authored state and ignores `if:show`, `from:expr`, `for:each`, and `on:event`.
A static surface may still choose to evaluate expressions once at render time - the ANSI renderer does, because a derived total is content, not interaction.
Either way the artifact stays valid; interactivity degrades, the information does not.
