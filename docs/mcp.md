# Delivery over MCP

Mosaic's core is transport-independent: `render(source)` needs no MCP, and a first-party app whose agent and renderer live together never touches this page.
MCP is the **interop** layer - how a third-party agent's artifact reaches a host that never pre-integrated it ([proposal §7.1](proposal.md#71-delivery-over-mcp)).
`@mosaic/mcp` is the optional package for that seam; the format does not depend on it.

## The resource

An artifact-producing MCP tool returns the IR as an embedded resource:

```ts
import { toResource } from "@mosaic/mcp";

// inside a tool handler
return { content: [toResource(doc)] };
```

which produces:

```jsonc
{
  "type": "resource",
  "resource": {
    "uri": "ui://mosaic/q3-plan",
    "mimeType": "application/vnd.mosaic+json",
    "text": "{\"mosaic_version\":\"1.0\",\"id\":\"q3-plan\",\"root\":{…}}"
  }
}
```

Each field has one job:

- **`uri`** is the artifact's stable address in the host's resource space - `ui://mosaic/` plus the artifact id.
  Because the id is stable across regenerations, a new version of the same artifact arrives at the **same** URI, and the host replaces the rendered tree instead of appending a second copy - the same replacement story as the fence id, carried into the transport.
  The `ui://` scheme is the MCP Apps convention marking a resource as an interface to render, not data; SEP-1865's `_meta.ui.resourceUri` points at exactly this.
- **`mimeType`** is how a host recognizes Mosaic at all - the one-line detection check below.
- **`text`** is the artifact itself: the [canonical mosaic-json](language.md#canonical-serialization).

## The host side

A Mosaic-aware host detects the resource and renders it natively - no iframe:

```ts
import { isMosaicResource } from "@mosaic/mcp";
import { render } from "@mosaic/react";

for (const item of toolResult.content) {
  if (isMosaicResource(item)) {
    return render(item.resource.text, { manifest, theme, components, onAction });
  }
}
```

`isMosaicResource` matches on the media type, so the check is one line in your message renderer - the same seam where you already special-case images or code blocks.

### Keep the IR out of the model's context

The resource's mosaic-json is addressed to your **renderer**, never to the model - the model's only surface is the Mosaic pattern.
Many hosts echo tool results back into the model's context; for a Mosaic resource, do not echo the JSON.
Render it, and if the model needs the artifact in context - to discuss it, revise it, or regenerate it - hand it the pattern instead: `serialize(doc, { format: 'jsx' })`, or the block's `alt` when a mention is enough.
The jsx form is also the cheaper one, so the correct representation and the token-efficient one are the same choice.

## The HTML bridge

A host that speaks MCP Apps (SEP-1865) but does not know Mosaic still gets a rendering.
`toHtmlBridge(doc)` returns a second resource, `text/html;profile=mcp-app`: a small self-contained page that carries the same IR and draws a static rendering inside the standard sandboxed iframe.

The bridge is deliberately static - no expression loop, no state - because a host that wants the interactive artifact should render the IR natively.
It is the compatibility floor, not the product.

SEP-1865's `mimeTypes` capability list is open and `_meta.ui.resourceUri` is mimeType-agnostic, so `application/vnd.mosaic+json` is a legitimate extension of MCP Apps, not a fork: Mosaic is the artifact an MCP tool returns.

## Intent relay

`createBridge(client, manifest)` wires both directions under the host's policy:

```ts
import { createBridge } from "@mosaic/mcp";

const bridge = createBridge({ dispatch: (action, args) => relayToHost(action, args) }, manifest);

bridge.deliver(doc); // [native resource, html bridge]
bridge.deliver(doc, { htmlBridge: false }); // native only
bridge.dispatch("order", { eggs: 80 }); // relays - or throws if manifest.permissions denies it
```

`dispatch` enforces `manifest.permissions` before relaying: an intent the host's policy marks `deny` throws instead of crossing.
This is the same rule as everywhere else in Mosaic - every action is the host's ([invariant 3](../ARCHITECTURE.md#invariants)) - applied at the transport seam.
