import { DEFAULT_MANIFEST, MOSAIC_MEDIA_TYPE, loadMosaic } from '@mosaic/core';
import { describe, expect, it } from 'vitest';
import { createBridge, isMosaicResource, toHtmlBridge, toResource } from '../src/index.js';

const DOC = loadMosaic('```mosaic v=1 id=q3-plan\n<Stack><Heading>Q3</Heading></Stack>\n```');

describe('@mosaic/mcp', () => {
  it('delivers the IR as a ui:// resource with the Mosaic media type', () => {
    const resource = toResource(DOC);
    expect(resource.resource.uri).toBe('ui://mosaic/q3-plan');
    expect(resource.resource.mimeType).toBe(MOSAIC_MEDIA_TYPE);
    expect(JSON.parse(resource.resource.text).id).toBe('q3-plan');
    expect(isMosaicResource(resource)).toBe(true);
  });

  it('ships the MCP-Apps HTML bridge alongside', () => {
    const bridge = createBridge({ dispatch: () => {} }, DEFAULT_MANIFEST);
    const resources = bridge.deliver(DOC);
    expect(resources).toHaveLength(2);
    const html = resources[1];
    expect(html?.resource.mimeType).toBe('text/html;profile=mcp-app');
    expect(html?.resource.text).toContain('application/vnd.mosaic+json');
    expect(html?.resource.text).toContain('q3-plan');
  });

  it('relays intents to the host and enforces deny policy', async () => {
    const seen: Array<{ action: string; args?: unknown }> = [];
    const bridge = createBridge(
      { dispatch: (action, args) => void seen.push({ action, args }) },
      { ...DEFAULT_MANIFEST, permissions: { openExternal: 'deny' } },
    );
    await bridge.dispatch('order', { eggs: 80, total: 40 });
    expect(seen).toEqual([{ action: 'order', args: { eggs: 80, total: 40 } }]);
    expect(() => bridge.dispatch('openExternal')).toThrow(/denies intent/);
  });

  it('escapes the IR safely into the HTML bridge', () => {
    const doc = loadMosaic('<Text>{"</script><script>alert(1)"}</Text>');
    const html = toHtmlBridge(doc).resource.text;
    expect(html).not.toContain('</script><script>alert(1)');
  });
});
