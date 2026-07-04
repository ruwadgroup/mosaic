'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, ChevronDown, Copy, Star } from 'lucide-react';
import * as React from 'react';

import { ChatDemo } from '@/components/chat-demo';
import { SiteNav } from '@/components/site-nav';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { GROUPS, type Showcase } from '@/lib/showcase-meta';

const INSTALL = 'npm install @mosaicjs/react @mosaicjs/core';
const DEFAULT_ID = 'pricing-estimator';

function InstallCommand() {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable; the command stays selectable text.
    }
  };
  return (
    <div className="flex w-fit max-w-full items-center gap-1 rounded-lg border border-border bg-card py-1 ps-3.5 pe-1">
      <code className="overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-muted-foreground">
        {INSTALL}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy install command"
        title="Copy"
        onClick={copy}
      >
        {copied ? (
          <Check className="text-success-foreground" aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function useStarCount(): string | null {
  const [stars, setStars] = React.useState<number | null>(null);
  React.useEffect(() => {
    fetch('https://api.github.com/repos/ruwadgroup/mosaic')
      .then((r) => (r.ok ? r.json() : null))
      .then((repo) => {
        if (typeof repo?.stargazers_count === 'number') setStars(repo.stargazers_count);
      })
      .catch(() => {});
  }, []);
  if (!stars) return null;
  return stars >= 1000 ? `${(stars / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(stars);
}

function Hero() {
  const stars = useStarCount();
  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-6 px-5 pt-16 pb-20 text-center">
      <h1
        data-hero
        className="m-0 text-balance font-[650] text-[38px] leading-[1.1] tracking-[-0.02em] sm:text-[48px]"
      >
        AI thoughts, made visible
      </h1>
      <p
        data-hero
        className="m-0 max-w-[52ch] text-pretty text-[15.5px] text-muted-foreground leading-relaxed"
      >
        Agents compose live interfaces out of general blocks; your app draws them with its own
        components. Everything below is a hand-written <code>.mosaic</code> file rendered by this
        site&apos;s design system - no iframe, no sandbox, nothing to run.
      </p>
      <div data-hero>
        <InstallCommand />
      </div>
      <div data-hero className="flex items-center gap-2">
        <Button
          render={
            // biome-ignore lint/a11y/useAnchorContent: useRender puts the button label inside the anchor
            <a href="https://github.com/ruwadgroup/mosaic" target="_blank" rel="noreferrer" />
          }
        >
          <Star aria-hidden="true" />
          Star on GitHub
          {stars ? <span className="font-mono text-[11.5px] opacity-80">{stars}</span> : null}
        </Button>
        <Button
          variant="secondary"
          render={
            // biome-ignore lint/a11y/useAnchorContent: useRender puts the button label inside the anchor
            <a href="#demo" />
          }
        >
          <ChevronDown aria-hidden="true" />
          See it work
        </Button>
      </div>
    </section>
  );
}

function DemoPicker({
  showcases,
  selected,
  onSelect,
}: {
  showcases: Showcase[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const items = showcases.map((s) => ({ value: s.id, label: s.title }));
  return (
    <Select items={items} value={selected} onValueChange={(v) => onSelect(String(v))}>
      <SelectTrigger className="w-full sm:w-72" aria-label="Pick a demo">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {GROUPS.map((group) => {
          const grouped = showcases.filter((s) => s.group === group.id);
          if (grouped.length === 0) return null;
          return (
            <SelectGroup key={group.id}>
              <SelectGroupLabel>{group.id}</SelectGroupLabel>
              {grouped.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectPopup>
    </Select>
  );
}

function DemoSection({ showcases }: { showcases: Showcase[] }) {
  const [selected, setSelected] = React.useState(DEFAULT_ID);
  const [showSource, setShowSource] = React.useState(false);
  const showcase =
    showcases.find((s) => s.id === selected) ?? showcases.find((s) => s.id === DEFAULT_ID);

  // Old links deep-linked demos by hash (/#review-changes); honor them.
  React.useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && showcases.some((s) => s.id === id)) {
      setSelected(id);
      document.getElementById('demo')?.scrollIntoView();
    }
  }, [showcases]);

  const select = (id: string) => {
    setSelected(id);
    setShowSource(false);
    window.history.replaceState(null, '', `#${id}`);
  };

  if (!showcase) return null;
  return (
    <section id="demo" className="mx-auto w-full max-w-[880px] scroll-mt-8 px-5 pb-24">
      <div data-demo className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="m-0 font-[650] text-[24px] tracking-[-0.015em]">Watch a reply arrive</h2>
          <p className="m-0 mt-1 text-[13.5px] text-muted-foreground">
            One question, one streamed artifact - then it&apos;s yours to poke. Pick a job:
          </p>
        </div>
        <DemoPicker showcases={showcases} selected={showcase.id} onSelect={select} />
      </div>

      <div data-demo>
        <ChatDemo key={showcase.id} showcase={showcase} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {showSource ? '▾ hide source' : '▸ view source'}
        </button>
        <a
          href={`https://github.com/ruwadgroup/mosaic/blob/main/examples/${showcase.id}.mosaic`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {showcase.id}.mosaic ↗
        </a>
      </div>
      {showSource ? (
        <pre className="mt-2 mb-0 overflow-auto whitespace-pre-wrap rounded-[12px] border border-border bg-card p-4 font-mono text-[12px] text-muted-foreground leading-relaxed">
          {showcase.source}
        </pre>
      ) : null}
    </section>
  );
}

export function Home({ showcases }: { showcases: Showcase[] }) {
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from('[data-hero]', {
        y: 22,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.09,
      });
      gsap.from('[data-demo]', {
        scrollTrigger: { trigger: '#demo', start: 'top 82%' },
        y: 26,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.12,
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="min-h-dvh bg-background">
      <SiteNav />
      <main>
        <Hero />
        <DemoSection showcases={showcases} />
      </main>

      <footer>
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-6 text-[12px] text-muted-foreground">
          <span>
            Rendered by <code className="font-mono text-[11px]">@mosaicjs/react</code>
            {' with this site’s own components.'}
          </span>
          <span className="ml-auto flex items-center gap-4">
            <a
              href="https://github.com/ruwadgroup/mosaic"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@mosaicjs/react"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              npm
            </a>
            <a
              href="https://github.com/sponsors/tamimbinhakim"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Sponsor
            </a>
            <a
              href="https://x.com/TamimBinHakim"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              @TamimBinHakim
            </a>
            <span>MIT</span>
          </span>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
