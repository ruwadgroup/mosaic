# `packages/` - reference implementation

Mosaic is a format, and this folder is the reference TypeScript implementation of it.
Mosaic does not ship a renderer for every language or surface - the builders who adopt Mosaic bring their own framework, built against the **IR** for their stack.
What lives here is the minimum a builder needs, plus a rich reference framework to copy from.

```text
packages/
└── ts/
    ├── mosaic-core   Mosaic compiler (Mosaic -> IR) · the IR · validate · resolve · expr · walk · registry · manifest
    ├── mosaic-react  the reference web framework: render() + the React NodeVisitor over the IR
    ├── mosaic-mcp    optional delivery: ui:// resources + the MCP-Apps bridge + on:event intent relay
    └── mosaic-ansi   the text/degraded framework (the decomposeTo floor)
```

## The packages

1. **[`ts/mosaic-core`](./ts/mosaic-core/)** - the framework-agnostic heart. The IR types, the Mosaic compiler (`Mosaic -> IR`), `validate`, `resolve`, the `expr` evaluator, `walk()`, the block registry, and the Host Manifest. Everything depends on it. (It absorbs what were separate `mosaic-wire`, `mosaic-schema`, and `mosaic-host` packages.)
2. **[`ts/mosaic-react`](./ts/mosaic-react/)** - **the** reference framework, for the web. `render(source, { manifest, onAction })`. What a builder reads to write their own via a `NodeVisitor` over the IR.
3. **[`ts/mosaic-mcp`](./ts/mosaic-mcp/)** - optional delivery: return an artifact as a `ui://` resource, ship the MCP-Apps HTML bridge, and relay `on:event` intents. The core works with no MCP at all.
4. **[`ts/mosaic-ansi`](./ts/mosaic-ansi/)** - the minimal text/degraded framework. Proves the `decomposeTo` fallback and gives non-web hosts a floor.

A builder targeting SwiftUI, Compose, Flutter, a TUI, or anything else writes a `NodeVisitor` against `mosaic-core`'s `walk()` - `mosaic-react` is the worked example, not a dependency.
There is no `mosaic-presets` package: Mosaic ships no templates, only the general block catalog and a host-macro mechanism.

## Status - implemented

All four packages are real: the compiler, `expr`, validate/resolve/`walk()`, the React and ANSI renderers, and MCP delivery are implemented and under test.
Every artifact in [`examples/`](../examples) parses, validates, renders interactively in React (see the [demo](../demo)), and degrades to readable text.

## Cross-package consistency

Every package uses the same `tsconfig.base.json`, builds with `tsup` (`pnpm run build`), tests with `vitest` (`pnpm run test`), lints and formats with Biome (`pnpm run check`), and publishes as `@mosaic/<name>`.
The lint/format invocations are wired into `lefthook.yml` at the repo root.
