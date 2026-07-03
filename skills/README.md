# Skills

The attachable agent skill that teaches a model to emit Mosaic. Two variants:

- **[`mosaic/`](mosaic)** - the portable, format-only skill. Attach this in any
  host; edit the block list to mirror your manifest.
- **[`mosaic-mcp/`](mosaic-mcp)** - the same skill plus guidance to use a host's
  Mosaic introspection MCP tools (`mosaic_ls`, `mosaic_cat`, `mosaic_validate`
  from [`@mosaicjs/ai/mcp`](../packages/ts/mosaic-ai)) before emitting. Attach this
  when your host registers those tools.

Both are templates: hosts edit the Blocks section to mirror what their renderer
actually draws, and swap the example for one in their house idiom.
