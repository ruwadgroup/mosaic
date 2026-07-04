'use client';

import { Mosaic, type OnIntent } from '@mosaicjs/react';

import { mosaicComponents } from '@/components/mosaic-blocks';

const NOOP: OnIntent = () => {};

export function Artifact({
  source,
  onIntent = NOOP,
  isStreaming,
}: {
  source: string;
  onIntent?: OnIntent;
  isStreaming?: boolean;
}) {
  return (
    <Mosaic
      source={source}
      components={mosaicComponents}
      onIntent={onIntent}
      isStreaming={isStreaming}
    />
  );
}
