import { createRegistry, defaultBlocks, defineBlockSchema } from '@mosaicjs/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Mosaic, defineComponents } from '../src/index.js';

const minimal = defineComponents({
  Stack: ({ children }) => createElement('div', { 'data-stack': true }, ...children),
  Card: ({ children }) => createElement('section', { 'data-card': true }, ...children),
  Text: ({ props, children }) => createElement('p', { 'data-variant': props.variant }, ...children),
  Stat: ({ props }) => createElement('dl', null, `${props.label}=${props.value ?? ''}`),
});

function html(props: Parameters<typeof Mosaic>[0]): string {
  return renderToStaticMarkup(createElement(Mosaic, props));
}

describe('the headless runtime', () => {
  it('renders through a minimal custom components map', () => {
    const out = html({
      source: '<Stack><Text>hello</Text></Stack>',
      components: minimal,
    });
    expect(out).toContain('data-stack');
    expect(out).toContain('hello');
  });

  it('coerces props before the host component sees them', () => {
    // value is a number in the source; the string prop stringifies it.
    const out = html({
      source: '<Stack state={{ n: 8 }}><Stat label="Eggs" value={n * 2} /></Stack>',
      components: minimal,
    });
    expect(out).toContain('Eggs=16');
  });

  it('renders unknown block types as their children, with no debug box', () => {
    const out = html({
      source: '<Mystery><Text>kept</Text></Mystery>',
      components: minimal,
    });
    expect(out).toContain('kept');
    expect(out).not.toContain('Mystery');
  });

  it('expands a macro-only custom block through the host components', () => {
    const Stamp = defineBlockSchema({
      name: 'Stamp',
      kind: 'content',
      doc: 'A labeled stamp.',
      props: { label: { type: 'string', required: true, doc: 'Stamp text.' } },
      example: '<Stamp label="Hi" />',
      expandsTo: '<Card><Text variant="label">{label}</Text></Card>',
    });
    const registry = createRegistry([...defaultBlocks, Stamp]);
    const out = html({
      source: '<Stamp label="Approved" />',
      components: minimal,
      registry,
    });
    expect(out).toContain('Approved');
    expect(out).toContain('data-card'); // the expansion's Card, drawn by the host
    expect(out).toContain('data-variant="label"'); // the expansion's Text variant
  });

  it('renders a streaming prefix progressively', () => {
    const out = html({
      source: '<Stack><Text>Streaming par',
      components: minimal,
      isStreaming: true,
    });
    expect(out).toContain('Streaming par');
  });

  it('falls back to the raw source when non-streaming source does not parse', () => {
    const out = html({
      source: '<Text>unterminated',
      components: minimal,
    });
    expect(out).toContain('unterminated');
    expect(out).toContain('<pre');
  });

  it('uses a custom fallback for unparseable source', () => {
    const out = html({
      source: '<<<garbage',
      components: minimal,
      fallback: (src) => createElement('code', null, `raw:${src}`),
    });
    expect(out).toContain('raw:&lt;&lt;&lt;garbage');
  });

  it('never blanks the artifact on a validation error', () => {
    // gap fails validation as a removed prop, but rendering is best-effort.
    const out = html({
      source: '<Stack gap="3"><Text>survives</Text></Stack>',
      components: minimal,
    });
    expect(out).toContain('survives');
  });
});
