/**
 * Pandoc/Typora 风格数学：`$...$` 行内、`$$...$$` 块级。
 * lezer/markdown 与 GFM 本身不解析美元公式，需自定义扩展。
 */
import type { BlockContext, InlineContext, Line, MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const DOLLAR = 36; /* $ */

function isDigit(ch: number): boolean {
  return ch >= 48 && ch <= 57;
}

/**
 * 行内 `$tex$`：排除 `$$`、空内容、`$5` 类金额（开闭美元紧邻数字）。
 */
function parseInlineMath(cx: InlineContext, next: number, pos: number): number {
  if (next !== DOLLAR) return -1;
  if (cx.char(pos + 1) === DOLLAR) return -1;
  if (isDigit(cx.char(pos + 1))) return -1;

  for (let i = pos + 1; i < cx.end; i++) {
    const ch = cx.char(i);
    if (ch === 92 /* \\ */) {
      i += 1;
      continue;
    }
    if (ch === 10 /* \\n */) return -1;
    if (ch === DOLLAR) {
      if (i === pos + 1) return -1;
      return cx.addElement(
        cx.elt("InlineMath", pos, i + 1, [
          cx.elt("InlineMathMark", pos, pos + 1),
          cx.elt("InlineMathMark", i, i + 1),
        ]),
      );
    }
  }
  return -1;
}

/**
 * 块级 `$$`：单行 `$$tex$$`，或多行：
 * ```
 * $$
 * tex
 * $$
 * ```
 */
function parseBlockMath(cx: BlockContext, line: Line): boolean {
  const text = line.text;
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  if (text.charCodeAt(leading) !== DOLLAR || text.charCodeAt(leading + 1) !== DOLLAR) {
    return false;
  }

  const start = cx.lineStart;
  const afterOpen = text.slice(leading + 2);
  const closeOnSame = afterOpen.indexOf("$$");

  // 单行 $$...$$
  if (closeOnSame >= 0) {
    const afterClose = afterOpen.slice(closeOnSame + 2).trim();
    if (afterClose.length > 0) return false;
    cx.addElement(cx.elt("BlockMath", start, start + text.length));
    cx.nextLine();
    return true;
  }

  // 开标记行：`$$` 后只能空白
  if (afterOpen.trim().length > 0) return false;

  if (!cx.nextLine()) {
    cx.addElement(cx.elt("BlockMath", start, cx.prevLineEnd()));
    return true;
  }

  for (;;) {
    const t = line.text;
    const lead = t.match(/^\s*/)?.[0].length ?? 0;
    const rest = t.slice(lead);
    if (rest.startsWith("$$") && rest.slice(2).trim().length === 0) {
      const end = cx.lineStart + t.length;
      cx.addElement(cx.elt("BlockMath", start, end));
      cx.nextLine();
      return true;
    }
    if (!cx.nextLine()) {
      cx.addElement(cx.elt("BlockMath", start, cx.prevLineEnd()));
      return true;
    }
  }
}

export const MathExtension: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: tags.special(tags.monospace) },
    { name: "InlineMathMark", style: tags.processingInstruction },
    { name: "BlockMath", style: tags.special(tags.monospace) },
    { name: "BlockMathMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "InlineMath",
      before: "Escape",
      parse: parseInlineMath,
    },
  ],
  parseBlock: [
    {
      name: "BlockMath",
      before: "FencedCode",
      parse: parseBlockMath,
    },
  ],
};

/** 从 InlineMath / BlockMath 节点文本中取出公式本体（去掉围栏美元）。 */
export function extractMathTex(raw: string, display: boolean): string {
  let text = raw.trim();
  if (display) {
    if (text.startsWith("$$")) text = text.slice(2);
    if (text.endsWith("$$")) text = text.slice(0, -2);
    return text.replace(/^\n+|\n+$/g, "").trim();
  }
  if (text.startsWith("$")) text = text.slice(1);
  if (text.endsWith("$")) text = text.slice(0, -1);
  return text.trim();
}
