/**
 * 轻量模糊匹配：子序列命中即算，连续匹配加权更高。
 * 不引入 fuse.js 等新依赖。
 */
import type { CommandListItem } from "./types";

function scoreMatch(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 + (100 - Math.min(q.length, 100));
  if (t.includes(q)) return 500;

  let ti = 0;
  let consecutive = 0;
  let score = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        consecutive += 1;
        score += 10 + consecutive * 4;
        ti += 1;
        found = true;
        break;
      }
      consecutive = 0;
      ti += 1;
    }
    if (!found) return -1;
  }
  return score;
}

function bestScore(query: string, item: CommandListItem): number {
  const fields = [item.title, item.subtitle ?? "", item.id, ...(item.keywords ?? [])];
  let best = -1;
  for (const field of fields) {
    const s = scoreMatch(query, field);
    if (s > best) best = s;
  }
  return best;
}

/** 按查询过滤并排序命令；空查询返回原列表顺序的副本。 */
export function filterCommands(items: CommandListItem[], query: string): CommandListItem[] {
  const q = query.trim();
  if (!q) return [...items];

  const ranked = items
    .map((item) => ({ item, score: bestScore(q, item) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "zh"));

  return ranked.map((row) => row.item);
}
