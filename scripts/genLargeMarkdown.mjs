/**
 * 生成约 2 万行 Markdown，用于滚动性能手工验收。
 * 用法：node scripts/genLargeMarkdown.mjs [输出路径]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve(process.argv[2] ?? "tmp/large-20k.md");
const lines = ["# Large Markdown Benchmark\n", "\n"];
const target = 20000;
while (lines.length < target) {
  const i = lines.length;
  if (i % 40 === 0) lines.push(`\n## Section ${Math.floor(i / 40)}\n`);
  lines.push(
    `Paragraph ${i}: Lorem ipsum dolor sit amet, **bold**, *italic*, \`code\`, and a [link](https://example.com).\n`,
  );
}
writeFileSync(out, lines.join(""), "utf8");
console.log(`Wrote ${lines.length} lines to ${out}`);
