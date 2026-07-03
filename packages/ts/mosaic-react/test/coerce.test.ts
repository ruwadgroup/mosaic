import { DEFAULT_REGISTRY } from '@mosaicjs/core';
import { describe, expect, it } from 'vitest';
import { coerceProps } from '../src/coerce.js';

const registry = DEFAULT_REGISTRY;
// biome-ignore lint/style/noNonNullAssertion: the default registry has these blocks
const Stat = registry.get('Stat')!;
// biome-ignore lint/style/noNonNullAssertion: the default registry has these blocks
const Text = registry.get('Text')!;
// biome-ignore lint/style/noNonNullAssertion: the default registry has these blocks
const DataTable = registry.get('DataTable')!;

describe('coerceProps', () => {
  it('stringifies a number arriving for a string prop', () => {
    expect(coerceProps({ label: 'Cases', value: 42 }, Stat)).toEqual({
      label: 'Cases',
      value: '42',
    });
  });

  it('drops a wrong-shaped object handed to a string prop', () => {
    expect(coerceProps({ label: 'x', value: { a: 1 } }, Stat)).toEqual({ label: 'x' });
  });

  it('drops an out-of-enum value', () => {
    expect(coerceProps({ variant: 'huge' }, Text)).toEqual({});
    expect(coerceProps({ variant: 'label' }, Text)).toEqual({ variant: 'label' });
  });

  it('passes undeclared props through untouched', () => {
    expect(coerceProps({ label: 'x', value: '1', custom: { deep: true } }, Stat)).toEqual({
      label: 'x',
      value: '1',
      custom: { deep: true },
    });
  });

  it('filters array props per element type', () => {
    expect(
      coerceProps({ columns: ['A', 2, { x: 1 }], rows: [['a', 'b'], 'nope'] }, DataTable),
    ).toEqual({ columns: ['A', '2'], rows: [['a', 'b']] });
  });
});
