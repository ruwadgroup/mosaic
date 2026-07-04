'use client';

import { BookOpen, Github, Heart } from 'lucide-react';
import Link from 'next/link';

import { ThemeToggle } from '@/components/theme-toggle';

export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const QUIET_LINKS = [
  {
    href: 'https://github.com/ruwadgroup/mosaic/blob/main/docs/README.md',
    label: 'Docs',
    Icon: BookOpen,
  },
  { href: 'https://github.com/sponsors/tamimbinhakim', label: 'Sponsor', Icon: Heart },
];

const FEATURED_LINKS = [
  { href: 'https://github.com/ruwadgroup/mosaic', label: 'GitHub', Icon: Github },
  { href: 'https://x.com/TamimBinHakim', label: '@TamimBinHakim', Icon: XIcon },
];

export function SiteNav() {
  return (
    <header>
      <div className="mx-auto flex h-[60px] w-full max-w-[1120px] items-center gap-3 px-5">
        <Link href="/" className="font-[650] text-[15px] text-foreground tracking-[-0.01em]">
          mosaic
        </Link>
        <nav className="ml-auto flex items-center gap-1.5" aria-label="Site">
          {QUIET_LINKS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span className="max-sm:sr-only">{label}</span>
            </a>
          ))}
          {FEATURED_LINKS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 font-medium text-[13px] text-foreground shadow-black/5 shadow-xs transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span className="max-sm:sr-only">{label}</span>
            </a>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
