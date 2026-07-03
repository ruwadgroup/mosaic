# @mosaic/mcp

> MCP delivery for Mosaic: return an artifact as a `ui://` resource, and relay `on:event` host actions to the host.

**Status: scaffold.**

This is how a Mosaic artifact reaches an app. An artifact-producing tool returns the AST as a `ui://mosaic/*` resource (`application/vnd.mosaic+json`), which a Mosaic-aware host renders natively, or as the `mosaic-over-mcp-apps` bridge for hosts that only speak MCP Apps. When a rendered artifact fires an `on:event` host action, the bridge hands that named intent to the host under its policy - the artifact never touches credentials or the network. See [§7.1](../../../docs/proposal.md#71-delivery-over-mcp) and [§8](../../../docs/proposal.md#8-security).

Target size: ~300 LOC.
