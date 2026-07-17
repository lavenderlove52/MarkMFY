/** 在纯文本中查找匹配（与 Rust 侧语义对齐：字面子串 / 大小写可选）。 */

export interface TextMatch {
  from: number;
  to: number;
  line: number;
  column: number;
  preview: string;
}

function pushMatch(text: string, from: number, to: number, out: TextMatch[]): void {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const lineEndIdx = text.indexOf("\n", from);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const line = text.slice(0, from).split("\n").length;
  const column = [...text.slice(lineStart, from)].length;
  out.push({
    from,
    to,
    line,
    column,
    preview: text.slice(lineStart, lineEnd).replace(/\s+$/u, ""),
  });
}

export function findInText(
  text: string,
  query: string,
  caseSensitive: boolean,
  limit = 2000,
): TextMatch[] {
  const q = query;
  if (!q) return [];
  const out: TextMatch[] = [];

  if (caseSensitive) {
    let start = 0;
    while (out.length < limit) {
      const idx = text.indexOf(q, start);
      if (idx < 0) break;
      pushMatch(text, idx, idx + q.length, out);
      start = idx + q.length;
    }
    return out;
  }

  const needle = [...q];
  const chars = [...text];
  const starts: number[] = [];
  let offset = 0;
  for (const ch of text) {
    starts.push(offset);
    offset += ch.length;
  }
  starts.push(offset);

  const n = chars.length;
  const m = needle.length;
  let i = 0;
  while (i + m <= n && out.length < limit) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (chars[i + j].toLocaleLowerCase() !== needle[j].toLocaleLowerCase()) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const from = starts[i];
      const to = starts[i + m];
      pushMatch(text, from, to, out);
      i += m;
    } else {
      i += 1;
    }
  }
  return out;
}

export function replaceAllInText(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): { text: string; count: number } {
  if (!query) return { text, count: 0 };
  if (caseSensitive) {
    if (!text.includes(query)) return { text, count: 0 };
    const parts = text.split(query);
    return { text: parts.join(replacement), count: parts.length - 1 };
  }

  const matches = findInText(text, query, false);
  if (matches.length === 0) return { text, count: 0 };
  let result = "";
  let cursor = 0;
  for (const m of matches) {
    result += text.slice(cursor, m.from);
    result += replacement;
    cursor = m.to;
  }
  result += text.slice(cursor);
  return { text: result, count: matches.length };
}
