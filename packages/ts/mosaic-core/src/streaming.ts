// Streaming completion: a model emits an artifact token by token, so most of
// the time a host holds a *prefix* of a valid artifact. completePartial() cuts
// that prefix back to the last well-formed boundary and closes the open tags,
// so the artifact renders progressively and grows as tokens arrive.
//
// This is a scanner, not a parser: it only tracks enough structure (tag stack,
// strings, brace depth, comments) to find safe cut points. The real compiler
// still judges the completed source.

/** Scan a balanced {...} run starting at `pos` (which must be '{'), honoring
 *  strings and comments. Returns the position after the closing '}', or -1 if
 *  the run is still open at end of input. */
function scanBraces(text: string, pos: number): number {
  let depth = 0;
  let i = pos;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = scanString(text, i);
      if (i === -1) return -1;
      continue;
    }
    if (c === '`') {
      i = scanTemplate(text, i);
      if (i === -1) return -1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

/** Scan a template literal starting at `pos` (which must be '`'), honoring
 *  escapes and nested ${…} interpolations. Returns the position after the
 *  closing backtick, or -1 if still open at end of input. */
function scanTemplate(text: string, pos: number): number {
  let i = pos + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i + 1;
    if (c === '$' && text[i + 1] === '{') {
      const end = scanBraces(text, i + 1);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    i++;
  }
  return -1;
}

/** Scan a quoted string starting at `pos`. Returns the position after the
 *  closing quote, or -1 if unterminated. */
function scanString(text: string, pos: number): number {
  const quote = text[pos];
  let i = pos + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i++;
  }
  return -1;
}

/** Scan a tag header from its '<' until '>' or '/>'. Returns
 *  { end, selfClosing, tag } or null when the header is still streaming in. */
function scanTagHeader(
  text: string,
  pos: number,
): { end: number; selfClosing: boolean; tag: string } | null {
  let i = pos + 1;
  let tag = '';
  while (i < text.length && /[A-Za-z0-9]/.test(text[i] as string)) {
    tag += text[i];
    i++;
  }
  if (tag.length === 0) return null;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = scanString(text, i);
      if (i === -1) return null;
      continue;
    }
    if (c === '{') {
      i = scanBraces(text, i);
      if (i === -1) return null;
      continue;
    }
    if (c === '/' && text[i + 1] === '>') return { end: i + 2, selfClosing: true, tag };
    if (c === '>') return { end: i + 1, selfClosing: false, tag };
    i++;
  }
  return null;
}

/**
 * Complete a streaming prefix of mosaic-jsx into renderable source: cut back
 * to the last well-formed boundary and append the missing closing tags.
 * Returns null while nothing is renderable yet (the root element has not
 * finished its opening tag). Content after the root element closes is
 * dropped - during streaming that is commentary still on its way out of the
 * fence, never artifact.
 */
export function completePartial(source: string): string | null {
  const text = source;
  const stack: string[] = [];
  let sawRoot = false;
  let i = 0;
  let cut = 0;

  while (i < text.length) {
    const c = text[i];

    if (c === '<') {
      if (text[i + 1] === '/') {
        // closing tag: complete it or cut before it
        const m = /^<\/([A-Za-z0-9]*)\s*(>?)/.exec(text.slice(i));
        if (!m || m[2] !== '>') {
          cut = i;
          break;
        }
        stack.pop();
        i += m[0].length;
        cut = i;
        if (sawRoot && stack.length === 0) break; // root closed; the rest is not artifact
        continue;
      }
      const header = scanTagHeader(text, i);
      if (header === null) {
        cut = i;
        break;
      }
      sawRoot = true;
      if (!header.selfClosing) stack.push(header.tag);
      i = header.end;
      cut = i;
      continue;
    }

    if (c === '{') {
      const end = scanBraces(text, i);
      if (end === -1) {
        cut = i;
        break;
      }
      i = end;
      cut = i;
      continue;
    }

    // plain text: safe at every character once the root is open; before the
    // root only whitespace is valid
    if (stack.length > 0 || /\s/.test(c as string)) {
      i++;
      cut = i;
      continue;
    }
    // stray non-whitespace before the root: nothing renderable
    return null;
  }

  if (!sawRoot) return null;
  const closers = [...stack]
    .reverse()
    .map((tag) => `</${tag}>`)
    .join('');
  const completed = text.slice(0, cut).trim() + closers;
  return completed.startsWith('<') ? completed : null;
}
