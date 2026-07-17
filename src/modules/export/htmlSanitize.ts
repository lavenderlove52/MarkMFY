/**
 * 导出用 HTML 白名单净化：只保留格式工具栏相关标签与 style 属性。
 */

const ALLOWED_TAGS = new Set(["u", "sup", "sub", "span", "p", "div", "br"]);

const ALLOWED_STYLE_KEYS = new Set([
  "color",
  "background-color",
  "font-size",
  "line-height",
  "text-align",
]);

function sanitizeStyleAttr(raw: string): string {
  const parts: string[] = [];
  for (const part of raw.split(";")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_KEYS.has(key) || !val) continue;
    if (/url\s*\(|expression\s*\(|javascript:/i.test(val)) continue;
    parts.push(`${key}: ${val}`);
  }
  return parts.join("; ");
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 对 markdown-it 输出中的「我们允许的受限 HTML」做二次净化：
 * - 去掉 script/iframe/on* 等危险标签与属性
 * - 仅保留白名单标签；span/div/p 仅保留白名单 style
 */
export function sanitizeExportHtml(html: string): string {
  // 先去掉明显危险的整块
  let out = html.replace(/<\s*(script|iframe|object|embed|link|meta|style)[\s\S]*?<\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(script|iframe|object|embed|link|meta|style)[^>]*>/gi, "");

  // 处理所有标签：保留白名单，剥离事件属性
  out = out.replace(/<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g, (full, rawName: string, rawAttrs: string) => {
    const name = rawName.toLowerCase();
    const closing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(name)) {
      // 非白名单标签：保留 markdown-it 生成的常见标签（由 md 自己产出）
      // 这里只拦截「带危险属性」的情况；标准 md 标签（h1/a/pre/code/table…）放行但剥 on*
      if (closing) return `</${name}>`;
      const cleaned = stripEventAttrs(rawAttrs);
      return `<${name}${cleaned}>`;
    }
    if (closing) return `</${name}>`;
    if (name === "br") return "<br>";
    const styleMatch = rawAttrs.match(/\sstyle\s*=\s*"([^"]*)"/i) || rawAttrs.match(/\sstyle\s*=\s*'([^']*)'/i);
    const style = styleMatch ? sanitizeStyleAttr(styleMatch[1] ?? "") : "";
    if (name === "u" || name === "sup" || name === "sub") {
      return `<${name}>`;
    }
    if (style) return `<${name} style="${escapeText(style)}">`;
    return `<${name}>`;
  });

  return out;
}

function stripEventAttrs(attrs: string): string {
  return attrs
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\shref\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, ' href="#"');
}
