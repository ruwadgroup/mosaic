import { createRegistry, defineBlockSchema, listBlocks } from '@mosaicjs/core';
import { describe, expect, it } from 'vitest';
import { mosaicSystemPrompt } from '../src/prompt.js';

describe('@mosaicjs/ai/prompt', () => {
  it('contains every block name in the default registry', () => {
    const prompt = mosaicSystemPrompt();
    for (const b of listBlocks()) {
      expect(prompt, `missing block ${b.name}`).toContain(b.name);
    }
  });

  it('groups blocks under kind headings', () => {
    const prompt = mosaicSystemPrompt();
    expect(prompt).toContain('layout:');
    expect(prompt).toContain('content:');
    expect(prompt).toContain('data:');
  });

  it('includes interactivity description', () => {
    const prompt = mosaicSystemPrompt();
    expect(prompt).toContain('INTERACTIVITY');
    expect(prompt).toContain('value=');
  });

  it('includes the three rules', () => {
    const prompt = mosaicSystemPrompt();
    expect(prompt).toContain('RULES:');
    expect(prompt).toContain('1.');
    expect(prompt).toContain('2.');
    expect(prompt).toContain('3.');
  });

  it('shows a custom registry block with (host) suffix', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: { airline: { type: 'string', required: true, doc: 'Carrier name.' } },
      example: '<FlightCard airline="ANA" />',
    });
    const registry = createRegistry([FlightCard]);
    const prompt = mosaicSystemPrompt(registry);
    expect(prompt).toContain('FlightCard (host)');
    expect(prompt).toContain('A single flight option.');
  });

  it('fits under 120 lines for the default registry', () => {
    const prompt = mosaicSystemPrompt();
    const lines = prompt.split('\n').length;
    expect(lines).toBeLessThan(120);
  });
});
