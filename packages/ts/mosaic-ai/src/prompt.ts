// @mosaicjs/ai/prompt - compact Mosaic emission contract for providers without tools.
//
// mosaicSystemPrompt() produces a tight system prompt: what Mosaic is, the full
// block vocabulary from the registry grouped by kind, the interactivity model,
// and the three canonical rules. Derived from the same source as the tools so
// they never drift.

import { DEFAULT_REGISTRY, type MosaicRegistry, listBlocks } from '@mosaicjs/core';

const KIND_ORDER = ['layout', 'content', 'control', 'structure', 'media', 'data'];

/** A compact system prompt for providers without tool-calling support.
 *  Contains every block name the registry lists, grouped by kind. */
export function mosaicSystemPrompt(registry: MosaicRegistry = DEFAULT_REGISTRY): string {
  const blocks = listBlocks(registry);

  const grouped = new Map<string, typeof blocks>();
  for (const b of blocks) {
    const group = grouped.get(b.kind) ?? [];
    group.push(b);
    grouped.set(b.kind, group);
  }

  const blockLines: string[] = [];
  for (const kind of KIND_ORDER) {
    const group = grouped.get(kind);
    if (!group || group.length === 0) continue;
    blockLines.push(`${kind}:`);
    for (const b of [...group].sort((a, c) => a.name.localeCompare(c.name))) {
      const suffix = b.host ? ' (host)' : '';
      blockLines.push(`  ${b.name}${suffix} - ${b.doc}`);
    }
  }

  return [
    'You are an AI that emits Mosaic artifacts - structured UI rendered by the host.',
    '',
    'FORMAT: output a ```mosaic fenced block containing Mosaic JSX.',
    '  ```mosaic',
    '  <Card><Text>Hello</Text></Card>',
    '  ```',
    '',
    'BLOCKS (use only these; call mosaic_cat for full prop schemas):',
    ...blockLines,
    '',
    'INTERACTIVITY: value={path} two-way binds state on a control; {cond && <El />} renders',
    'conditionally; {list.map((item) => <El />)} repeats; onClick={intent({ ...args })} fires an intent.',
    '',
    'RULES:',
    '1. Canonical schemas only - no invented block names or props.',
    '2. Every visual block (Image, Chart, Diagram) needs an alt prop describing the content.',
    '3. No invented props - consult the block list above and use only documented props.',
  ].join('\n');
}
