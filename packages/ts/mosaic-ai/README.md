# @mosaicjs/ai

Multi-provider AI adapters for Mosaic: the three introspection tools (`mosaic_ls`, `mosaic_cat`, `mosaic_validate`) wired into every major provider style, all registry-aware so host-defined blocks appear everywhere.

## Entry points

### `@mosaicjs/ai` (root) - framework-neutral

```ts
import {
  lsBlocks,
  catBlock,
  validateSource,
  mosaicToolDescriptors,
  runMosaicTool,
} from '@mosaicjs/ai';

// All functions accept an optional registry for host-defined blocks.
console.log(lsBlocks());
console.log(catBlock('DataTable, Chart'));
console.log(validateSource('<Card><Text>hi</Text></Card>'));

const descriptors = mosaicToolDescriptors(); // readonly MosaicTool[]
const result = runMosaicTool('mosaic_ls', { kind: 'layout' });
```

### `@mosaicjs/ai/vercel` - Vercel AI SDK v5+

Peer dependency: `ai >= 6.0.0`

```ts
import { mosaicTools } from '@mosaicjs/ai/vercel';
import { streamText } from 'ai';

const result = await streamText({
  model: myModel,
  tools: { ...mosaicTools() },
  prompt: 'Build me a dashboard artifact.',
});
```

### `@mosaicjs/ai/mcp` - Model Context Protocol SDK

Peer dependencies: `@modelcontextprotocol/sdk >= 1.0.0`, `zod >= 3.25.0`

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMosaicTools } from '@mosaicjs/ai/mcp';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
registerMosaicTools(server);
```

### `@mosaicjs/ai/prompt` - system prompt for providers without tools

```ts
import { mosaicSystemPrompt } from '@mosaicjs/ai/prompt';

const system = mosaicSystemPrompt(); // string: format + block list + rules
```

## Custom registry

All entry points accept a registry so host-defined blocks appear in `mosaic_ls`, `mosaic_cat`, and `mosaic_validate`.

```ts
import { createRegistry, defineBlockSchema } from '@mosaicjs/core';
import { mosaicTools } from '@mosaicjs/ai/vercel';
import { mosaicSystemPrompt } from '@mosaicjs/ai/prompt';

const FlightCard = defineBlockSchema({
  name: 'FlightCard',
  kind: 'data',
  doc: 'A single flight option with price and times.',
  props: {
    airline: { type: 'string', required: true, doc: 'Carrier name.' },
    price: { type: 'string', required: true, doc: 'Display price.' },
  },
  example: '<FlightCard airline="ANA" price="$820" />',
  expandsTo: `
    <Card>
      <Stack direction="horizontal" justify="between">
        <Text>{airline}</Text>
        <Text variant="label">{price}</Text>
      </Stack>
    </Card>`,
});

const registry = createRegistry([FlightCard]);

// FlightCard appears in mosaic_ls, mosaic_cat, mosaic_validate, and the prompt.
const tools = mosaicTools(registry);
const prompt = mosaicSystemPrompt(registry);
```
