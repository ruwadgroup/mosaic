# @mosaic/react

> The reference React renderer for Mosaic. Web. The worked example a builder copies for their own stack.

**Status: scaffold.** `MosaicArtifact` returns `null` today.

Mosaic ships one reference renderer, and this is it. ~1500 LOC of TypeScript when complete. The architecture mirrors `safe-mdx` and Sophie Alpert's _build your own React renderer_: `render()` is `parse → validate → resolve → walk(reactVisitor)` from `@mosaic/core`, mounting a React subtree from a registry of blocks. No `eval`, no `Function`, no `dangerouslySetInnerHTML`. A renderer for SwiftUI, Compose, Flutter, or a TUI is the same shape - a `NodeVisitor` against the same `walk()` contract.

See [§7.2](../../../docs/proposal.md#72-the-public-api).

## Planned API

```tsx
import { render, Mosaic } from '@mosaic/react';
import { DEFAULT_MANIFEST } from '@mosaic/core';

// as a function:
render(artifactSource, { manifest: DEFAULT_MANIFEST, onAction: (name, args) => host.handle(name, args) });

// or as a component:
<Mosaic source={artifactSource} manifest={manifest} onAction={onAction} />
```

`onAction` receives every `on:event` host intent; local `state.*` mutations and `expr` derivations stay inside the renderer. Delivery over MCP is a separate concern - see `@mosaic/mcp`.
