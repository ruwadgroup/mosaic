# @mosaicjs/ansi

> The text/degraded renderer for Mosaic - the `decomposeTo` floor. No React; renders the IR as plain text or ANSI.

**Status: implemented.** The full example gallery renders under test.

For scripts, CI logs, pipes, and any non-web host that wants a baseline.
Rich blocks decompose to primitives (a `Diagram` becomes grouped node lines and `from -> to` edges, a `DataTable` becomes an aligned text table, `Progress` becomes `[█████░░░] 50%`), controls print their state, and derived `expr` values still evaluate - they are content, not interaction.

```ts
import { renderAnsi } from "@mosaicjs/ansi";

console.log(renderAnsi(source)); // plain text, safe to pipe
console.log(renderAnsi(source, { color: true })); // ANSI tones
```

It exists to prove the floor: every artifact renders readably everywhere ([invariant 8](../../../ARCHITECTURE.md#invariants)).
Full reference: [docs/rendering.md](../../../docs/rendering.md#mosaicansi---the-text-floor).
