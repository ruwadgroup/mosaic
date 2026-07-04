'use client';

import { RotateCcw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Artifact } from '@/components/artifact';
import type { Showcase } from '@/lib/showcase-meta';
import { cn } from '@/lib/utils';

const POST =
  'Everything above is live - drag it, flip it, click it. Every click lands as one typed intent with computed args.';

type DemoState = { user: boolean; pre: number; lines: number; post: number };
type FeedEntry = { id: number; action: string; argsText: string; followup?: string };

let nextId = 1;

function compactArgs(args: unknown): string {
  if (args === undefined || args === null) return '';
  if (typeof args !== 'object' || Array.isArray(args)) return JSON.stringify(args);
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return '';
  return `{ ${entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} }`;
}

export function ChatDemo({ showcase }: { showcase: Showcase }) {
  const lines = React.useMemo(() => showcase.source.split('\n'), [showcase.source]);
  const preWords = React.useMemo(() => showcase.description.split(' '), [showcase.description]);
  const postWords = React.useMemo(() => POST.split(' '), []);
  const full: DemoState = React.useMemo(
    () => ({ user: true, pre: preWords.length, lines: lines.length, post: postWords.length }),
    [preWords, lines, postWords],
  );
  const [run, setRun] = React.useState(0);
  const [s, set] = React.useState<DemoState>({ user: false, pre: 0, lines: 0, post: 0 });
  const [feed, setFeed] = React.useState<FeedEntry[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` re-triggers the animation on replay
  React.useEffect(() => {
    setFeed([]);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(full);
      return;
    }
    set({ user: false, pre: 0, lines: 0, post: 0 });
    const timers: number[] = [];
    const at = (t: number, fn: () => void) => timers.push(window.setTimeout(fn, t));
    at(300, () => set((v) => ({ ...v, user: true })));
    for (let i = 1; i <= preWords.length; i++)
      at(850 + i * 34, () => set((v) => ({ ...v, pre: i })));
    const t0 = 850 + preWords.length * 34 + 300;
    for (let i = 1; i <= lines.length; i++) at(t0 + i * 40, () => set((v) => ({ ...v, lines: i })));
    const t1 = t0 + lines.length * 40 + 350;
    for (let i = 1; i <= postWords.length; i++)
      at(t1 + i * 34, () => set((v) => ({ ...v, post: i })));
    return () => timers.forEach(clearTimeout);
  }, [run, full, preWords, lines, postWords]);

  const followupsRef = React.useRef(showcase.followups);
  followupsRef.current = showcase.followups;

  const onIntent = React.useCallback((action: string, args?: unknown) => {
    const argsText = compactArgs(args);
    toast(`intent · ${action}`, argsText ? { description: argsText } : undefined);
    setFeed((f) =>
      [...f, { id: nextId++, action, argsText, followup: followupsRef.current?.[action] }].slice(
        -6,
      ),
    );
  }, []);

  const streamed = s.lines > 0 ? lines.slice(0, s.lines).join('\n') : '';
  const done = s.post >= postWords.length;

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <div className="flex min-h-110 flex-col gap-3 overflow-x-auto rounded-[16px] border border-border bg-background p-4 shadow-black/5 shadow-lg sm:p-6 dark:shadow-black/25">
        <div
          className={cn(
            'max-w-[85%] self-end rounded-2xl rounded-ee-md border border-border bg-card px-3.5 py-2 text-[13px] transition-opacity duration-300 sm:max-w-[70%]',
            s.user ? 'opacity-100' : 'opacity-0',
          )}
        >
          {showcase.prompt}
        </div>
        {s.pre > 0 ? (
          <p className="m-0 max-w-[62ch] text-[13px] text-muted-foreground">
            {preWords.slice(0, s.pre).join(' ')}
            {s.pre < preWords.length ? <span className="animate-pulse">▍</span> : null}
          </p>
        ) : null}
        {streamed ? (
          <div className="rounded-[12px] border border-border/70 bg-card/40 p-3.5 sm:p-4">
            <Artifact source={streamed} isStreaming={s.lines < lines.length} onIntent={onIntent} />
          </div>
        ) : null}
        {s.post > 0 ? (
          <p className="m-0 max-w-[62ch] text-[13px] text-muted-foreground">
            {postWords.slice(0, s.post).join(' ')}
            {!done ? <span className="animate-pulse">▍</span> : null}
          </p>
        ) : null}
        {feed.map((entry) => (
          <React.Fragment key={entry.id}>
            <div className="break-all font-mono text-[11.5px] text-success-foreground">
              → intent {entry.action}
              {entry.argsText ? ` ${entry.argsText}` : ''}
            </div>
            {entry.followup ? (
              <p className="m-0 max-w-[62ch] text-[13px] text-muted-foreground">{entry.followup}</p>
            ) : null}
          </React.Fragment>
        ))}
      </div>
      <figcaption className="flex items-center gap-2 self-end font-mono text-[11px] text-muted-foreground">
        {done ? 'streamed, then live - your turn' : 'streaming the way a model streams it'}
        {done ? (
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            replay
          </button>
        ) : null}
      </figcaption>
    </figure>
  );
}
