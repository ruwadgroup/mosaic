// Host Manifest (docs/proposal.md §3.3) — capabilities and policy, never design.
// The host's renderer draws every component; token values never travel.

export type GraphicsLevel = 'none' | 'static' | 'rich';
export type PermissionValue = 'allow' | 'deny' | 'user-consent';

export type HostManifest = {
  mosaic_version: '1.0';
  interactive: boolean;
  graphics: GraphicsLevel;
  components_supported: string[];
  components_unsupported?: string[];
  directives_supported: string[];
  directives_unsupported?: string[];
  permissions?: Record<string, PermissionValue>;
  strict?: boolean;
};

export const DEFAULT_MANIFEST: HostManifest = {
  mosaic_version: '1.0',
  interactive: true,
  graphics: 'rich',
  components_supported: [
    'DataTable',
    'List',
    'Tree',
    'Board',
    'Timeline',
    'Calendar',
    'Stat',
    'Chart',
  ],
  directives_supported: [
    'bind:state',
    'from:state',
    'from:expr',
    'if:show',
    'for:each',
    'on:event',
    'theme:scope',
    'slot:name',
    'key',
  ],
  permissions: { Embed: 'deny' },
  strict: false,
};

/** The compact manifest form that lands in the model's system prompt. */
export function compactManifest(m: HostManifest): string {
  const lines = [
    `mosaic ${m.mosaic_version} · interactive=${m.interactive} · graphics=${m.graphics}`,
    `components: ${m.components_supported.join(', ')}`,
    `directives: ${m.directives_supported.join(', ')}`,
  ];
  const denied = Object.entries(m.permissions ?? {})
    .filter(([, v]) => v !== 'allow')
    .map(([k, v]) => `${k}=${v}`);
  if (denied.length > 0) lines.push(`permissions: ${denied.join(', ')}`);
  return lines.join('\n');
}

// --- Theme: render-time configuration, never part of the manifest -------------

export type Theme = {
  color: Record<string, string>;
  space: Record<string, number>;
  radius: Record<string, number>;
  font: Record<string, string>;
  tone?: Record<string, string>;
};

export const DEFAULT_THEME: Theme = {
  color: {
    bg: '#101318',
    surface: '#171b21',
    fg: '#eef1f4',
    accent: '#7c7cff',
    subtle: '#8a919b',
    border: 'rgba(238, 241, 244, 0.1)',
  },
  space: { '1': 4, '2': 8, '3': 12, '4': 16, '5': 24, '6': 32 },
  radius: { sm: 6, md: 10, lg: 14, full: 9999 },
  font: {
    sans: "'DM Sans Variable', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    mono: "'SF Mono', 'JetBrains Mono', Consolas, Menlo, monospace",
  },
  tone: { ok: '#10b981', warn: '#f59e0b', bad: '#ef4444' },
};

/** Resolve a token reference (e.g. "color.accent") against a renderer's theme values. */
export function resolveToken(theme: Theme, path: string): string | number | undefined {
  const [group, key] = path.split('.');
  if (!group || !key) return undefined;
  const groupTable = theme[group as keyof Theme];
  return groupTable?.[key];
}
