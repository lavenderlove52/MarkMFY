/** Editor 内替换辅助（避免依赖 search 模块）。 */

export function replaceAllInDoc(
  text: string,
  query: string,
  caseSensitive: boolean,
): { ranges: { from: number; to: number }[]; count: number } {
  if (!query) return { ranges: [], count: 0 };
  if (caseSensitive) {
    if (!text.includes(query)) return { ranges: [], count: 0 };
    const ranges: { from: number; to: number }[] = [];
    let start = 0;
    while (true) {
      const idx = text.indexOf(query, start);
      if (idx < 0) break;
      ranges.push({ from: idx, to: idx + query.length });
      start = idx + query.length;
    }
    return { ranges, count: ranges.length };
  }

  const needle = [...query];
  const chars = [...text];
  const starts: number[] = [];
  let offset = 0;
  for (const ch of text) {
    starts.push(offset);
    offset += ch.length;
  }
  starts.push(offset);

  const ranges: { from: number; to: number }[] = [];
  const n = chars.length;
  const m = needle.length;
  let i = 0;
  while (i + m <= n) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (chars[i + j].toLocaleLowerCase() !== needle[j].toLocaleLowerCase()) {
        ok = false;
        break;
      }
    }
    if (ok) {
      ranges.push({ from: starts[i], to: starts[i + m] });
      i += m;
    } else {
      i += 1;
    }
  }
  return { ranges, count: ranges.length };
}

export function findNextInDoc(
  text: string,
  query: string,
  caseSensitive: boolean,
  fromPos: number,
): { from: number; to: number } | null {
  if (!query) return null;
  if (caseSensitive) {
    const idx = text.indexOf(query, fromPos);
    if (idx >= 0) return { from: idx, to: idx + query.length };
    const wrap = text.indexOf(query, 0);
    if (wrap >= 0 && wrap < fromPos) return { from: wrap, to: wrap + query.length };
    return null;
  }
  const needle = [...query];
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
  const startChar = [...text.slice(0, fromPos)].length;
  for (const begin of [startChar, 0]) {
    for (let i = begin; i + m <= n; i++) {
      if (begin === 0 && i >= startChar) break;
      let ok = true;
      for (let j = 0; j < m; j++) {
        if (chars[i + j].toLocaleLowerCase() !== needle[j].toLocaleLowerCase()) {
          ok = false;
          break;
        }
      }
      if (ok) return { from: starts[i], to: starts[i + m] };
    }
  }
  return null;
}
