# @mosaic/mcp

> Optional MCP delivery for Mosaic: return an artifact as a `ui://` resource, and relay `on:event` host intents under host policy.

**Status: implemented.** Resources, the MCP-Apps HTML bridge, and permission-gated intent relay are real and under test.

This is how an artifact reaches an app that never pre-integrated it; the core needs none of this.
An artifact-producing tool returns the IR as a `ui://mosaic/*` resource (`application/vnd.mosaic+json`), which a Mosaic-aware host detects with `isMosaicResource` and renders natively - no iframe.
Hosts that only speak MCP Apps get a second, static `text/html;profile=mcp-app` representation via `toHtmlBridge`.
`createBridge` packages both directions and refuses intents the manifest's `permissions` deny.

```ts
import { toResource, isMosaicResource, createBridge } from "@mosaic/mcp";
```

Full reference: [docs/mcp.md](../../../docs/mcp.md).
See [§7.1](../../../docs/proposal.md#71-delivery-over-mcp) and [§8](../../../docs/proposal.md#8-security).
