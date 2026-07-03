# @mosaic/ansi

> The text/degraded renderer for Mosaic - the `decomposeTo` floor. No React; walks the AST and emits plain text / ANSI.

**Status: scaffold.**

For scripts, CI logs, pipes, and any non-web host that wants a baseline. Decomposition is heavy: `KPI` becomes a one-line `label: value (delta)`, `Comparison` becomes a multi-column boxed table, `BarChart` becomes Unicode block characters. It proves that a preset degrades to primitives cleanly.

See [§7.2](../../../docs/proposal.md#72-the-public-api).

Target size: ~400 LOC.
