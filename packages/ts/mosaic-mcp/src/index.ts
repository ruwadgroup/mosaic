// @mosaic/mcp — delivery: return an artifact as a ui:// resource, and relay
// on:event host intents to the host. See docs/proposal.md §7.1 (delivery) and
// §3.2 (dispatch). MCP is the interop layer; the core needs none of this.

import {
  type HostManifest,
  type JsonLiteral,
  MOSAIC_MEDIA_TYPE,
  type MosaicDocument,
  toCanonicalJson,
} from '@mosaic/core';

/** An MCP embedded resource carrying a Mosaic artifact. */
export type MosaicResource = {
  type: 'resource';
  resource: { uri: string; mimeType: string; text: string };
};

export type HostClient = {
  /** Hand a named on:event host intent to the host, under its policy.
   *  The artifact never acts on its own; the host decides what to do. */
  dispatch(action: string, args?: JsonLiteral): void | Promise<void>;
};

export type DeliveryBridge = {
  /** Serialize an artifact as MCP resources: the native `application/vnd.mosaic+json`
   *  form, plus (optionally) the `text/html;profile=mcp-app` bridge for hosts that
   *  only speak MCP Apps. */
  deliver(doc: MosaicDocument, opts?: { htmlBridge?: boolean }): MosaicResource[];
  /** Relay an on:event host intent to the host. */
  dispatch(action: string, args?: JsonLiteral): void | Promise<void>;
};

export const MOSAIC_URI_SCHEME = 'ui://mosaic/';
export const HTML_BRIDGE_MIME = 'text/html;profile=mcp-app';

export function artifactUri(doc: MosaicDocument): string {
  return `${MOSAIC_URI_SCHEME}${doc.id}`;
}

/** The native resource an artifact-producing MCP tool returns. */
export function toResource(doc: MosaicDocument): MosaicResource {
  return {
    type: 'resource',
    resource: {
      uri: artifactUri(doc),
      mimeType: MOSAIC_MEDIA_TYPE,
      text: toCanonicalJson(doc),
    },
  };
}

/** Detect a Mosaic resource in an MCP tool result (the host-side seam). */
export function isMosaicResource(value: unknown): value is MosaicResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MosaicResource).type === 'resource' &&
    (value as MosaicResource).resource?.mimeType === MOSAIC_MEDIA_TYPE
  );
}

/** The MCP-Apps bridge: a self-contained HTML page rendering the same IR for a
 *  host that does not know Mosaic. Static (no expr loop) by design — a host
 *  that wants the interactive artifact renders the IR natively. */
export function toHtmlBridge(doc: MosaicDocument): MosaicResource {
  const json = toCanonicalJson(doc);
  const html = `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(doc.id)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 16px; }
  .card { border: 1px solid #8884; border-radius: 8px; padding: 12px; margin: 8px 0;
          display: flex; flex-direction: column; gap: 8px; }
  table { border-collapse: collapse; } td, th { padding: 2px 8px; text-align: left; }
  .subtle { opacity: .6 }
</style>
<div id="root"></div>
<script id="mosaic-ir" type="application/vnd.mosaic+json">${json.replace(/</g, '\\u003c')}</script>
<script>
(function () {
  var doc = JSON.parse(document.getElementById('mosaic-ir').textContent);
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function text(v) { return document.createTextNode(v == null ? '' : String(v)); }
  function render(node) {
    if (node.type === '#text') {
      var v = node.props && node.props.value;
      return text(typeof v === 'object' && v ? '' : v);
    }
    var p = node.props || {};
    var out;
    switch (node.type) {
      case 'Heading': out = el('h' + (p.level || 2)); break;
      case 'Text': out = el('p'); if (p.tone === 'subtle') out.className = 'subtle'; break;
      case 'Card': out = el('section', 'card'); break;
      case 'Divider': return el('hr');
      case 'Stat': out = el('div'); out.appendChild(text((p.label || '') + ': ' + (p.value == null || typeof p.value === 'object' ? '' : p.value))); return out;
      case 'DataTable': {
        out = el('table');
        var head = el('tr');
        (p.columns || []).forEach(function (c) { var th = el('th'); th.appendChild(text(c)); head.appendChild(th); });
        out.appendChild(head);
        (p.rows || []).forEach(function (r) {
          var tr = el('tr');
          (Array.isArray(r) ? r : [r]).forEach(function (c) { var td = el('td'); td.appendChild(text(typeof c === 'object' ? '' : c)); tr.appendChild(td); });
          out.appendChild(tr);
        });
        return out;
      }
      default: out = el('div');
    }
    (node.children || []).forEach(function (c) { out.appendChild(render(c)); });
    return out;
  }
  document.getElementById('root').appendChild(render(doc.root));
})();
</script>
`;
  return {
    type: 'resource',
    resource: { uri: `${artifactUri(doc)}.html`, mimeType: HTML_BRIDGE_MIME, text: html },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wire a delivery bridge to a host: deliver() packages artifacts, dispatch()
 *  relays intents under the host's policy. */
export function createBridge(client: HostClient, manifest: HostManifest): DeliveryBridge {
  return {
    deliver(doc, opts) {
      const resources = [toResource(doc)];
      if (opts?.htmlBridge !== false) resources.push(toHtmlBridge(doc));
      return resources;
    },
    dispatch(action, args) {
      if (manifest.permissions?.[action] === 'deny') {
        throw new Error(`mosaic: host policy denies intent '${action}'`);
      }
      return client.dispatch(action, args);
    },
  };
}
