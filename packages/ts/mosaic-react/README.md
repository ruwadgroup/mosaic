# @mosaicjs/react

> The reference React renderer for Mosaic - the provided web library, and the worked example a builder copies for their own stack.

**Status: implemented.** The full pipeline (`parse → resolve → render`; validation is advisory and stays the host's call via `validate()` from `@mosaicjs/core`), the reference blocks, path-based state, custom-component overrides, theming, and the SVG `Diagram` renderer are real and under test.

The architecture mirrors `safe-mdx` and Sophie Alpert's _build your own React renderer_: state lives in one React store, every state change re-resolves the artifact, and only named host intents leave through `onAction`.
No `eval`, no `Function`, no `dangerouslySetInnerHTML`.
A renderer for SwiftUI, Compose, Flutter, or a TUI is the same shape - a `NodeVisitor` against `@mosaicjs/core`'s `walk()` contract.

```tsx
import { render, Mosaic } from "@mosaicjs/react";

// as a function:
render(source, {
  theme: myTheme, // token → value map for the reference blocks
  components: { Card: MyCard }, // your own blocks win over everything
  onAction: (name, args) => host.handle(name, args), // every host intent lands here
});

// or as a component:
<Mosaic source={source} onAction={onAction} />;
```

Local `state.*` mutations and `expr` derivations stay inside the renderer; `onAction` receives only host intents, with their `expr` args already computed.
`layoutDiagram` - the deterministic, dependency-free diagram layout - is exported for hosts that draw `Diagram` themselves.

Full reference: [docs/react.md](../../../docs/react.md).
