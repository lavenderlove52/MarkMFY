/**
 * Markdown → 完整 HTML 文档（导出专用）。
 * 使用 markdown-it + Shiki + KaTeX；不用于实时编辑渲染。
 */
import MarkdownIt from "markdown-it";
import multimdTable from "markdown-it-multimd-table";
import taskLists from "markdown-it-task-lists";
import { joinPath, renderKatexHtml } from "../editor";
import { EXPORT_DOCUMENT_CSS } from "./exportStyles";
import { sanitizeExportHtml } from "./htmlSanitize";
import type { RenderMarkdownOptions } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 在 markdown-it 解析前抽出公式，避免被转义或拆坏。 */
function extractMathPlaceholders(src: string): {
  text: string;
  slots: { id: string; html: string }[];
} {
  const slots: { id: string; html: string }[] = [];
  let seq = 0;

  const push = (tex: string, display: boolean): string => {
    const id = `<!--MM_MATH_${seq++}-->`;
    const inner = renderKatexHtml(tex, display);
    const html = display
      ? `<div class="mm-math mm-math--block">${inner}</div>`
      : `<span class="mm-math mm-math--inline">${inner}</span>`;
    slots.push({ id, html });
    return id;
  };

  // 先块级 $$...$$（含多行），再行内 $...$
  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => push(tex.trim(), true));
  text = text.replace(
    /(?<!\$)\$(?!\$)((?:\\.|[^$\n])+?)\$(?!\$)/g,
    (_m, tex: string) => {
      const t = tex.trim();
      // 与 Live Preview 一致：开美元后紧跟数字视为金额，不解析为公式
      if (!t || /^\d/.test(t)) return `$${tex}$`;
      return push(t, false);
    },
  );

  return { text, slots };
}

function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  });
  md.use(multimdTable, {
    multiline: true,
    rowspan: false,
    headerless: false,
  });
  md.use(taskLists, { enabled: true, label: true, labelAfter: true });
  return md;
}

async function highlightFence(code: string, lang: string): Promise<string> {
  const language = lang.trim() || "text";
  const { codeToHtml } = await import("shiki");
  try {
    return await codeToHtml(code, {
      lang: language,
      theme: "github-light",
    });
  } catch {
    try {
      return await codeToHtml(code, {
        lang: "text",
        theme: "github-light",
      });
    } catch {
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
  }
}

async function loadKatexCss(): Promise<string> {
  try {
    const mod = await import("katex/dist/katex.min.css?raw");
    return typeof mod.default === "string" ? mod.default : String(mod.default ?? "");
  } catch {
    // Vite raw 不可用时退化为 CDN 链（离线导出仍以内嵌为主）
    return "";
  }
}

/**
 * 将 Markdown 渲染为带内嵌 CSS 的完整 HTML 文档字符串。
 */
export async function renderMarkdownDocument(
  markdown: string,
  options: RenderMarkdownOptions = {},
): Promise<string> {
  const md = createMarkdownIt();
  const title = options.title?.trim() || "MarkMFY Export";
  const { text: mdWithPlaceholders, slots: mathSlots } = extractMathPlaceholders(markdown);

  const fenceTokens: { tokenIndex: number; code: string; lang: string; placeholder: string }[] = [];
  let fenceSeq = 0;

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";
    const lang = info.split(/\s+/g)[0] ?? "";
    const placeholder = `<!--MM_FENCE_${fenceSeq++}-->`;
    fenceTokens.push({ tokenIndex: idx, code: token.content, lang, placeholder });
    return placeholder;
  };

  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));

  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0 && token.attrs) {
      const raw = token.attrs[srcIndex][1];
      if (raw && !/^[a-z]+:\/\//i.test(raw) && !raw.startsWith("data:") && options.baseDir) {
        const absolute = joinPath(options.baseDir, raw);
        token.attrs[srcIndex][1] = options.resolveImageSrc
          ? options.resolveImageSrc(absolute)
          : absolute;
      }
    }
    return defaultImage(tokens, idx, opts, env, self);
  };

  let body = sanitizeExportHtml(md.render(mdWithPlaceholders));

  for (const fence of fenceTokens) {
    const highlighted = await highlightFence(fence.code.replace(/\n$/, ""), fence.lang);
    body = body.replace(fence.placeholder, highlighted);
  }
  for (const slot of mathSlots) {
    body = body.replace(slot.id, slot.html);
  }

  const katexCss = await loadKatexCss();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${EXPORT_DOCUMENT_CSS}
${katexCss}
.mm-math--block { margin: 1em 0; text-align: center; overflow-x: auto; }
.mm-math--inline { display: inline-block; vertical-align: middle; margin: 0 0.15em; }
.mm-math-error { color: #b42318; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
