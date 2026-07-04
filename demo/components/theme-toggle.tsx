'use client';

import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

function toggleTheme() {
  const root = document.documentElement;
  // Suppress transitions so the whole surface snaps between themes at once.
  root.classList.add('no-transitions');
  const isDark = root.classList.toggle('dark');
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  } catch {
    // Private mode or storage disabled: the toggle still works for the session.
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('no-transitions'));
  });
}

/**
 * Light/dark switch for the topbar. The icons swap purely via the `dark:`
 * variant, so the server markup (default dark) never mismatches on hydration.
 */
export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={toggleTheme}
    >
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="block dark:hidden" aria-hidden="true" />
    </Button>
  );
}
