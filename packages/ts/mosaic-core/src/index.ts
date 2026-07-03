// @mosaicjs/core - the framework-agnostic heart of Mosaic.
//
// The Mosaic compiler (mosaic-jsx -> IR), the IR types, validate, resolve, the
// expr evaluator, walk(), the block registry, and the Host Manifest.
// No I/O. The one package everything depends on. The design is docs/proposal.md.

import { MOSAIC_VERSION, type MosaicDocument, type MosaicNode } from './ast.js';
import { JsxError, type ParseError, parseJsx } from './jsx.js';
import type { HostManifest } from './manifest.js';
import { DEFAULT_REGISTRY, type MosaicRegistry } from './registry.js';
import { stripFence, toCanonicalJson, toJsxSource, toMosaicFile } from './serialize.js';
import { completePartial } from './streaming.js';
import { type ValidationResult, validateDocument } from './validate.js';

export {
  MOSAIC_VERSION,
  MOSAIC_MEDIA_TYPE,
  MOSAIC_EXTENSION,
  TEXT_TYPE,
  DIRECTIVE_NAMES,
  isExprRef,
  isTextNode,
  textNode,
} from './ast.js';
export type {
  ActionRef,
  Directives,
  DirectiveName,
  ExprRef,
  JsonLiteral,
  MosaicDocument,
  MosaicNode,
  PropValue,
} from './ast.js';

export {
  EXPR_FUNCTIONS,
  ExprError,
  MAX_EXPR_NODES,
  MAX_EXPR_STEPS,
  displayValue,
  evalExpr,
  exprDependencies,
  parseExpr,
} from './expr.js';
export type { ExprValue } from './expr.js';

export { JsxError } from './jsx.js';
export type { ParseError } from './jsx.js';

export { completePartial } from './streaming.js';

export { parseFence, stripFence, toCanonicalJson, toJsxSource, toMosaicFile } from './serialize.js';

export { defineBlockSchema } from './schema.js';
export type {
  BlockDefinition,
  BlockKind,
  InferBlockProps,
  PropSpec,
  PropTypeName,
} from './schema.js';

export { defaultBlocks } from './blocks.js';

export {
  DEFAULT_REGISTRY,
  createRegistry,
  describeBlock,
  expandMacro,
  listBlocks,
} from './registry.js';
export type {
  BlockDefinitionJson,
  BlockDescription,
  BlockListing,
  MosaicRegistry,
  RegistryJson,
} from './registry.js';

export type { BlockPropTypes } from './blocks.gen.js';

export { parseForEach } from './validate.js';
export type { ValidationDiagnostic, ValidationResult } from './validate.js';

/** Validate a document against the block registry (DEFAULT_REGISTRY unless a
 *  registry of host vocabulary is passed) and the host manifest. */
export function validate(
  doc: MosaicDocument,
  manifest: HostManifest,
  opts?: { registry?: MosaicRegistry },
): ValidationResult {
  return validateDocument(doc, manifest, opts?.registry ?? DEFAULT_REGISTRY);
}

export { initialState, resolve, walk } from './resolve.js';
export type { NodeVisitor, StateScope } from './resolve.js';

export {
  parseStatePath,
  readStatePath,
  resolveStatePath,
  writeStatePath,
} from './state-path.js';
export type { StatePath, StatePathSegment } from './state-path.js';

export { DEFAULT_MANIFEST, compactManifest } from './manifest.js';
export type { HostManifest, PermissionValue } from './manifest.js';

export type ParseResult = { ok: true; doc: MosaicDocument } | { ok: false; errors: ParseError[] };

function isDocumentShape(v: unknown): v is MosaicDocument {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as MosaicDocument).id === 'string' &&
    typeof (v as MosaicDocument).root === 'object'
  );
}

function fromJson(text: string): MosaicDocument {
  const parsed: unknown = JSON.parse(text);
  if (!isDocumentShape(parsed)) {
    throw new JsxError([
      { line: 1, column: 1, message: 'not a Mosaic document', code: 'INVALID_DOCUMENT' },
    ]);
  }
  return parsed;
}

/** Parse mosaic-jsx or mosaic-json (auto-detected; ```mosaic fences accepted)
 *  into a MosaicDocument.
 *
 *  `streaming` treats the source as a prefix still being emitted: it is cut
 *  back to the last well-formed boundary and its open tags are closed, so an
 *  artifact renders progressively as tokens arrive. */
export function parse(
  source: string,
  opts?: { format?: 'jsx' | 'json'; id?: string; streaming?: boolean },
): ParseResult {
  try {
    const { id, body: fenced } = stripFence(source);
    const format = opts?.format ?? (fenced.startsWith('{') ? 'json' : 'jsx');
    if (format === 'json') return { ok: true, doc: fromJson(fenced) };
    let body = fenced;
    if (opts?.streaming) {
      const completed = completePartial(fenced);
      if (completed === null) {
        return {
          ok: false,
          errors: [
            {
              line: 1,
              column: 1,
              message: 'artifact still streaming; nothing renderable yet',
              code: 'INCOMPLETE_ARTIFACT',
            },
          ],
        };
      }
      body = completed;
    }
    const root = parseJsx(body);
    return {
      ok: true,
      doc: { mosaic_version: MOSAIC_VERSION, id: opts?.id ?? id ?? 'artifact', root },
    };
  } catch (e) {
    if (e instanceof JsxError) return { ok: false, errors: e.errors };
    if (e instanceof SyntaxError) {
      return {
        ok: false,
        errors: [{ line: 1, column: 1, message: e.message, code: 'INVALID_JSON' }],
      };
    }
    throw e;
  }
}

/** Serialize a MosaicDocument to canonical mosaic-json or mosaic-jsx. */
export function serialize(doc: MosaicDocument, opts?: { format?: 'jsx' | 'json' }): string {
  return (opts?.format ?? 'json') === 'json' ? toCanonicalJson(doc) : toJsxSource(doc);
}

/** Read a .mosaic file's text into a MosaicDocument. Throws JsxError on bad input. */
export function loadMosaic(text: string): MosaicDocument {
  const result = parse(text);
  if (!result.ok) throw new JsxError(result.errors);
  return result.doc;
}

/** Serialize a MosaicDocument to a fenced .mosaic file. */
export function saveMosaic(doc: MosaicDocument): string {
  return toMosaicFile(doc);
}

/** Structural helper used by tooling: every node in document order. */
export function* nodes(doc: MosaicDocument): Generator<MosaicNode> {
  function* visit(node: MosaicNode): Generator<MosaicNode> {
    yield node;
    for (const child of node.children ?? []) yield* visit(child);
    for (const slot of Object.values(node.slots ?? {})) {
      for (const child of slot) yield* visit(child);
    }
  }
  yield* visit(doc.root);
}
