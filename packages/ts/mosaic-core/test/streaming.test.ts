// Streaming completion: a model emits an artifact token by token, and
// completePartial() cuts the prefix back to the last well-formed boundary and
// closes the open tags so hosts render progressively.

import { describe, expect, it } from 'vitest';

import { completePartial, parse } from '@mosaicjs/core';

describe('completePartial', () => {
  it('closes open tags on a clean boundary', () => {
    expect(completePartial('<Card><Text>hello</Text>')).toBe('<Card><Text>hello</Text></Card>');
  });

  it('cuts an unterminated opening tag back to its start', () => {
    expect(completePartial('<Card><Text>hi</Text><Badge tone="wa')).toBe(
      '<Card><Text>hi</Text></Card>',
    );
  });

  it('cuts an unterminated brace child', () => {
    expect(completePartial('<Card><Text>{formatCurrency(a +')).toBe('<Card><Text></Text></Card>');
  });

  it('cuts an unterminated template literal inside braces', () => {
    expect(completePartial('<Card><Text>{`Seats: ${se')).toBe('<Card><Text></Text></Card>');
  });

  it('keeps a completed brace child with a template literal and nested braces', () => {
    expect(completePartial('<Card><Text>{`${n} of ${m}`}</Text><Badge to')).toBe(
      '<Card><Text>{`${n} of ${m}`}</Text></Card>',
    );
  });

  it('scans template literals inside attribute braces', () => {
    expect(completePartial('<Card><Field label={`Seats: ${seats}`}><Slider val')).toBe(
      '<Card><Field label={`Seats: ${seats}`}></Field></Card>',
    );
  });

  it('cuts an unterminated closing tag', () => {
    expect(completePartial('<Card><Text>hi</Te')).toBe('<Card><Text>hi</Text></Card>');
  });

  it('keeps streaming text content', () => {
    expect(completePartial('<Card><Text>partial senten')).toBe(
      '<Card><Text>partial senten</Text></Card>',
    );
  });

  it('returns null before the root opening tag completes', () => {
    expect(completePartial('')).toBeNull();
    expect(completePartial('<Ca')).toBeNull();
    expect(completePartial('<Card tone="o')).toBeNull();
  });

  it('drops content after the root closes', () => {
    expect(completePartial('<Card><Text>x</Text></Card> and then some prose')).toBe(
      '<Card><Text>x</Text></Card>',
    );
  });

  it('round-trips through parse(streaming)', () => {
    const r = parse('<Card state={{ seats: 4 }}><Text>{seats}</Text><Badge to', {
      streaming: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.root.type).toBe('Card');
    expect(r.doc.root.children).toHaveLength(1);
  });

  it('a streaming prefix with an open conditional child stays renderable', () => {
    const r = parse('<Card state={{ open: true }}>{open && <Text>de', { streaming: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.root.children ?? []).toHaveLength(0); // the half-open brace run is cut
  });

  it('reports INCOMPLETE_ARTIFACT while nothing is renderable', () => {
    const r = parse('<Car', { streaming: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.code).toBe('INCOMPLETE_ARTIFACT');
  });
});
