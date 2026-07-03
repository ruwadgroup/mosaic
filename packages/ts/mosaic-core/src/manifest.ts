// Host Manifest (docs/proposal.md §3.3) - capabilities and policy, never design.
// The host's renderer draws every component; style values never travel.

/** The three states a host may declare for a named permission. */
export type PermissionValue = 'allow' | 'deny' | 'user-consent';

/** The host's capabilities and policy declaration (docs/proposal.md §3.3).
 *  Passed to validate and resolve so both can target the actual host surface. */
export type HostManifest = {
  mosaic_version: '1.0';
  interactive: boolean;
  components_supported: string[];
  components_unsupported?: string[];
  directives_supported: string[];
  directives_unsupported?: string[];
  permissions?: Record<string, PermissionValue>;
  strict?: boolean;
};

/** A permissive manifest for development: all directives supported, rich
 *  blocks listed, Embed denied, strict mode off. */
export const DEFAULT_MANIFEST: HostManifest = {
  mosaic_version: '1.0',
  interactive: true,
  components_supported: [
    'DataTable',
    'List',
    'Tree',
    'Board',
    'Timeline',
    'Calendar',
    'Stat',
    'Chart',
    'Diagram',
  ],
  directives_supported: [
    'bind:state',
    'from:state',
    'from:expr',
    'if:show',
    'for:each',
    'on:event',
    'slot:name',
    'key',
  ],
  permissions: { Embed: 'deny' },
  strict: false,
};

/** The compact manifest form that lands in the model's system prompt. */
export function compactManifest(m: HostManifest): string {
  const lines = [
    `mosaic ${m.mosaic_version} · interactive=${m.interactive}`,
    `components: ${m.components_supported.join(', ')}`,
    `directives: ${m.directives_supported.join(', ')}`,
  ];
  const denied = Object.entries(m.permissions ?? {})
    .filter(([, v]) => v !== 'allow')
    .map(([k, v]) => `${k}=${v}`);
  if (denied.length > 0) lines.push(`permissions: ${denied.join(', ')}`);
  return lines.join('\n');
}
