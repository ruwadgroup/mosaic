# The `expr` language

`expr` is the bounded expression language behind every derived value in Mosaic ([proposal §6.2](proposal.md#62-the-expr-expression-language)).
It is CEL-class by construction: linear-time, terminating, side-effect-free, and not Turing-complete.
It is AST-interpreted - never `eval`, never compiled to a function - so it is CSP-safe and there is nothing executable to sandbox ([invariant 2](../ARCHITECTURE.md#invariants)).

An expression reads the artifact's [state scope](interactivity.md#the-state-model) and produces a JSON value.
That is all it can do.

## Where expressions appear

```jsx
<Stat value={expr("seats * 16")} />                 // expr("…") in any prop, or as a {child}
<Stat from:expr="seats * 16" />                     // the from:expr directive
<Callout if:show="seats >= 100" />                  // if:show - a bare expression string
<Row for:each="filter(tasks, t, t.open) as t" />    // the source of a for:each
<Checkbox bind:state="files[i].checked" />          // [index] segments of a state path
<Card key={expr("t.id")} />                         // a computed list key
```

Directive values are already expression strings; only props and children need the `expr("…")` wrapper to distinguish an expression from a literal.

## Values

An expression value is any JSON value: string, number, boolean, `null`, array, or object.
There is no `undefined`: an identifier not in scope, a missing member, and an out-of-range index all evaluate to `null`, exactly like a state-path read.
Rendered as text, `null` shows as the empty string, and arrays and objects show as their JSON.

## Grammar

Operators, loosest to tightest:

| Level          | Operators                 | Notes                                                      |
| -------------- | ------------------------- | ---------------------------------------------------------- |
| ternary        | `cond ? a : b`            | right-associative                                          |
| or             | `\|\|`                    | short-circuit; returns the deciding operand, not a boolean |
| and            | `&&`                      | short-circuit; returns the deciding operand                |
| equality       | `==` `!=`                 | deep structural equality on arrays and objects             |
| relational     | `<` `<=` `>` `>=` `in`    | see [comparison](#coercion-and-comparison)                 |
| additive       | `+` `-`                   | `+` concatenates when either side is a string              |
| multiplicative | `*` `/` `%`               |                                                            |
| unary          | `!` `-`                   |                                                            |
| postfix        | `.prop` `[index]` `fn(…)` | member access, indexing, whitelisted calls                 |

Plus: parentheses, list literals `[a, b, c]`, string literals with `'` or `"` and `\n \t \\ \'` `\"` escapes, decimal and exponent numbers, `true` / `false` / `null`.

`in` is membership: element in array (deep equality), key in object, substring in string.

**Not in the grammar, rejected at parse time:** assignment, user-defined functions and lambdas outside the fold forms below, method calls (`items.map(…)` - use `map(items, …)`), object literals, `new`, and any I/O.
Recursion is unrepresentable.

## Coercion and comparison

- **Truthiness** (`if:show`, `!`, `&&`, `||`, ternary, `filter`/`any`/`all` bodies): `null`, `false`, `0`, `""`, and the **empty array** are false; every object, non-empty array, and other value is true.
- **To number** (arithmetic, relational on non-strings): booleans become 0/1, numeric strings parse, everything else - including `null` and non-numeric strings - becomes 0.
- **To string** (`+` with a string, string functions, text display): `null` becomes `""`, arrays and objects become their JSON, others `String(…)`.
- **Equality** `==` / `!=`: deep and structural - `[1, 2] == [1, 2]` holds; no type coercion.
- **Ordering** `<` `<=` `>` `>=` and `sort`: two strings compare lexicographically; any other pair compares numerically after coercion.

## The function catalog

The catalog is a fixed whitelist; calling anything else is a parse error.

### Math

| Function                        | Behavior                    |
| ------------------------------- | --------------------------- |
| `abs(n)`                        | absolute value              |
| `min(a, b, …)`                  | smallest argument           |
| `max(a, b, …)`                  | largest argument            |
| `round(n)` `floor(n)` `ceil(n)` | nearest / down / up integer |
| `clamp(n, lo, hi)`              | `n` limited to `[lo, hi]`   |

### String

| Function                        | Behavior                                                     |
| ------------------------------- | ------------------------------------------------------------ |
| `len(v)`                        | length of a string or array; 0 otherwise                     |
| `lower(s)` `upper(s)` `trim(s)` | case and whitespace                                          |
| `concat(a, b, …)`               | concatenation with string coercion                           |
| `substr(s, start, end?)`        | slice by index (negative indices allowed)                    |
| `replace(s, find, repl)`        | replaces **all** occurrences                                 |
| `split(s, sep)`                 | string to array                                              |
| `join(arr, sep)`                | array to string                                              |
| `contains(hay, needle)`         | substring test on a string; deep membership test on an array |

### Format

| Function                  | Behavior                                         |
| ------------------------- | ------------------------------------------------ |
| `formatCurrency(n, cur?)` | `"$1,234.50"`; currency code defaults to `USD`   |
| `formatNumber(n)`         | grouped: `"1,234,567"`                           |
| `toFixed(n, digits?)`     | fixed decimals as a string; digits defaults to 0 |

### Array folds

The folds iterate materialized arrays only - state arrays or list literals - which is what keeps evaluation linear.
A non-array first argument folds as the empty array.
`map`, `filter`, `any`, `all`, and `sortBy` take a bound item name and a body expression; `reduce` adds an accumulator.

| Function                                | Behavior                                   |
| --------------------------------------- | ------------------------------------------ |
| `map(arr, x, body)`                     | transform each item                        |
| `filter(arr, x, body)`                  | keep items whose body is truthy            |
| `any(arr, x, body)` `all(arr, x, body)` | boolean folds                              |
| `reduce(arr, x, acc, body, init)`       | general fold: `reduce(ns, n, a, a + n, 0)` |
| `sum(arr)`                              | numeric sum                                |
| `count(arr)`                            | length                                     |
| `sort(arr)`                             | sorted copy (comparison rules above)       |
| `sortBy(arr, x, body)`                  | sorted copy by a computed key              |
| `slice(arr, start, end?)`               | sub-array                                  |

```jsx
<Text>{expr("concat('Selected ', count(filter(files, f, f.checked)), ' of ', count(files))")}</Text>
```

### Misc

| Function            | Behavior                      |
| ------------------- | ----------------------------- |
| `has(obj, key)`     | whether a record has the key  |
| `coalesce(a, b, …)` | the first non-`null` argument |

## Limits

Three bounds hold regardless of input, and blowing one is an `ExprError`, not a hang:

- **Static cost bound:** an expression may parse to at most **500 AST nodes**; oversized expressions are rejected before they ever run, and `validate` reports them as `INVALID_EXPR`.
- **Step budget:** one evaluation may take at most **100,000 interpreter steps** - the runtime backstop.
- **String cap:** no string result may exceed **100,000 characters**.

Evaluation is deterministic: no randomness, no clock, no locale surprises (formatting is pinned to `en-US`), so the same expression over the same state yields the same value on every surface.
