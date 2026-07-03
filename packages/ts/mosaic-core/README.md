# @mosaic/core

> The framework-agnostic heart of Mosaic: the IR types, the Mosaic compiler (`Mosaic -> IR`), `validate`, `resolve`, the `expr` evaluator, `walk()`, the block registry, and the Host Manifest.

**Status: implemented.** The compiler, the `expr` evaluator, validation, resolution, and `walk()` are real; every example in [`examples/`](../../../examples) parses, validates, resolves, and round-trips through the canonical serialization under test.

This is the one package everything else depends on.
It absorbs what were separate `@mosaic/wire` (compile), `@mosaic/schema` (registry + validate), and `@mosaic/host` (manifest + theme) packages - the IR is small enough that splitting them added surface without value.

- **IR** - `MosaicNode`, `MosaicDocument`, `Directives`, `JsonLiteral` (docs/proposal.md [§4](../../../docs/proposal.md#4-the-building-blocks)).
- **Compile** - `parse` / `compile` (`Mosaic -> IR`) and the IR's canonical JSON serialization; `loadMosaic` reads `.mosaic` source (§5).
- **expr** - `evalExpr`, the bounded CEL-class expression language behind `from:expr` / `if:show` / `for:each` (§6.2). AST-interpreted, never `eval`.
- **walk** - `walk(doc, visitor, manifest)`, the portable contract every framework implements (§7.2).
- **Manifest** - `HostManifest`, `DEFAULT_MANIFEST`, `compactManifest` (§3.3); plus `Theme`, `DEFAULT_THEME`, and `resolveToken` for renderers that take a token→value map.

A non-React framework imports from here and implements a `NodeVisitor` over the IR; `@mosaic/react` is the worked example.
