import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * 语法高亮配色不用固定十六进制值，而是读取 theme 模块注入的
 * `--mm-syntax-*` CSS 变量：
 * - 颜色选取参考 Okabe-Ito 色盲安全色板（蓝/橙/紫红/青绿），避免经典的红绿对比
 *   （原默认样式里 literal 用绿、string 用红，对红绿色盲极不友好）。
 * - 关键区分（如 invalid）额外叠加粗体/下划线等非颜色线索，避免只靠色相辨识。
 * - 深浅主题各自在 applyTheme.ts 里提供对比度匹配的取值，此文件不关心具体色值。
 */
export const markmfyHighlightStyle: HighlightStyle = HighlightStyle.define([
  { tag: t.meta, color: "var(--mm-syntax-meta)" },
  { tag: t.link, color: "var(--mm-color-accent)", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.keyword, color: "var(--mm-syntax-keyword)", fontWeight: "bold" },
  { tag: [t.atom, t.bool, t.url, t.contentSeparator, t.labelName], color: "var(--mm-syntax-atom)" },
  { tag: [t.literal, t.inserted], color: "var(--mm-syntax-literal)" },
  { tag: [t.string, t.deleted], color: "var(--mm-syntax-string)" },
  { tag: [t.regexp, t.escape, t.special(t.string)], color: "var(--mm-syntax-string)", fontStyle: "italic" },
  { tag: t.definition(t.variableName), color: "var(--mm-syntax-literal)", fontWeight: "bold" },
  { tag: t.local(t.variableName), color: "var(--mm-syntax-type)" },
  { tag: [t.typeName, t.namespace], color: "var(--mm-syntax-type)", fontWeight: "bold" },
  { tag: t.className, color: "var(--mm-syntax-type)", fontStyle: "italic" },
  { tag: [t.special(t.variableName), t.macroName], color: "var(--mm-syntax-atom)", fontStyle: "italic" },
  { tag: t.definition(t.propertyName), color: "var(--mm-syntax-keyword)", fontStyle: "italic" },
  { tag: t.comment, color: "var(--mm-syntax-comment)", fontStyle: "italic" },
  {
    tag: t.invalid,
    color: "var(--mm-color-danger)",
    fontWeight: "bold",
    textDecoration: "underline wavy",
  },
]);
