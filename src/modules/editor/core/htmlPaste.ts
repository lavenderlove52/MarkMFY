/**
 * 富文本粘贴：把浏览器 clipboard 里的 `text/html`（来自飞书文档 / Word / 网页复制等）
 * 转换成 Markdown，插入编辑器。
 *
 * 背景：CM6 默认粘贴只吃 `text/plain`。飞书等站点复制出来的 `text/plain` 会把图片
 * 退化成"[图片]"占位文字、把表格拍扁成缩进列表，样式和结构全部丢失。这里改成优先读
 * `text/html`，自己写一个不依赖第三方库的 HTML→Markdown 转换器（表格复用既有
 * `tableModel.ts` 的 GFM 序列化逻辑）。
 *
 * 不做的事（保持范围可控）：不处理 colspan/rowspan、不识别只靠行内 style 模拟的
 * 标题/加粗（没有真实语义标签时退化为纯文本）、不支持嵌套表格。
 */
import { savePastedImage } from "../../../ipc";
import { escapeTableCell, serializeTable } from "../decorations/tableModel";

export interface HtmlPasteContext {
  /** 当前文档路径；用于把图片落盘到同级 assets 目录。 */
  markdownFilePath: string;
}

const RICH_SELECTOR =
  "table, img, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, a[href], strong, b, em, i, del, s, strike";

/**
 * 判断这段 HTML 是否值得走富文本转换。
 * 编辑器内部复制/粘贴自身内容时，浏览器也会附带一份 `text/html`（纯文本套一层
 * `<span style="...">`），这类不含真实语义标签的片段应该走原有的纯文本粘贴，
 * 否则会把编辑器内部正常的复制粘贴行为一起改写。
 */
export function isRichHtmlFragment(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  return !!doc.body.querySelector(RICH_SELECTOR);
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "figure",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
  "hr",
]);

interface PendingImage {
  token: string;
  src: string;
  alt: string;
}

interface ConvertState {
  images: PendingImage[];
  seq: number;
  /**
   * 飞书文档的"标题自动编号"在导出剪贴板 HTML 时，不会稳定序列化成 `<h1>`~`<h6>`，
   * 而是被拍扁成"只有一个 `<li>`"的独立 `<ol>/<ul>`（装饰性序号，且每个标题各自独立
   * 从 1 开始），导致粘贴后被当成一级普通列表项渲染（参考用户反馈："标题格式没有
   * 识别，应该是连续的1级标题"）。这个特征只在飞书来源时启用，避免误伤其它站点
   * 真实的单条目列表。
   */
  singletonListAsHeading: boolean;
}

/** 粗略判断这段剪贴板 HTML 是否来自飞书/Lark 文档（class/属性里通常带 lark/feishu 字样）。 */
function looksLikeFeishuHtml(html: string): boolean {
  return /lark|feishu/i.test(html);
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function collapseWhitespace(text: string): string {
  return text.replace(/[\t\n\r]+/g, " ").replace(/ {2,}/g, " ");
}

/** 转义会被误认成 Markdown 语法的字符（内联文本节点）。 */
function escapeInlineText(text: string): string {
  return text.replace(/([\\*_`[\]])/g, "\\$1");
}

function wrapInlineCode(rawText: string): string {
  const runs = rawText.match(/`+/g) ?? [];
  const maxRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(maxRun + 1);
  const pad = rawText.startsWith("`") || rawText.endsWith("`") ? " " : "";
  return `${fence}${pad}${rawText}${pad}${fence}`;
}

function extractLangFromClassName(className: string): string {
  const match = /language-([\w-]+)/.exec(className);
  return match?.[1] ?? "";
}

function pushImageToken(state: ConvertState, src: string, alt: string): string {
  const token = `\u0000MMPASTE_IMG_${state.seq++}\u0000`;
  state.images.push({ token, src, alt });
  return token;
}

function inlineNodeToMarkdown(node: Node, state: ConvertState): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeInlineText(collapseWhitespace(node.textContent ?? ""));
  }
  if (!isElement(node)) return "";
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "br":
      return "\n";
    case "strong":
    case "b": {
      const inner = inlineToMarkdown(node, state).trim();
      return inner ? `**${inner}**` : "";
    }
    case "em":
    case "i": {
      const inner = inlineToMarkdown(node, state).trim();
      return inner ? `*${inner}*` : "";
    }
    case "del":
    case "s":
    case "strike": {
      const inner = inlineToMarkdown(node, state).trim();
      return inner ? `~~${inner}~~` : "";
    }
    case "code": {
      const text = node.textContent ?? "";
      return text ? wrapInlineCode(text) : "";
    }
    case "a": {
      const href = node.getAttribute("href") ?? "";
      const inner = inlineToMarkdown(node, state).trim();
      if (!href) return inner;
      return `[${inner || href}](${href})`;
    }
    case "img":
      return pushImageToken(state, node.getAttribute("src") ?? "", node.getAttribute("alt") ?? "");
    case "script":
    case "style":
      return "";
    default:
      return inlineToMarkdown(node, state);
  }
}

function inlineToMarkdown(el: Element, state: ConvertState): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    out += inlineNodeToMarkdown(child, state);
  }
  return out;
}

function listItemToLines(li: Element, state: ConvertState, marker: string, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  let buffer = "";
  let firstLineEmitted = false;

  const flushBuffer = (): void => {
    const text = collapseWhitespace(buffer).trim();
    buffer = "";
    if (!text) return;
    lines.push(firstLineEmitted ? `${indent}  ${text}` : `${indent}${marker} ${text}`);
    firstLineEmitted = true;
  };

  for (const child of Array.from(li.childNodes)) {
    const tag = isElement(child) ? child.tagName.toLowerCase() : "";
    if (tag === "ul" || tag === "ol") {
      flushBuffer();
      const nested = listToMarkdown(child as Element, state, tag === "ol", depth + 1);
      if (nested) lines.push(nested);
      continue;
    }
    buffer += inlineNodeToMarkdown(child, state);
  }
  flushBuffer();
  if (lines.length === 0) lines.push(`${indent}${marker}`);
  return lines;
}

/**
 * 把"只有一个 `<li>` 且不含嵌套子列表"的 `<ol>/<ul>` 当作被拍扁的标题还原成 `# `。
 * 命中条件很窄（必须单条目 + 无嵌套 + 飞书来源），真正的单条目列表极少见，
 * 误判代价远小于放任标题被渲染成列表项。
 */
function tryPromoteSingletonListToHeading(el: Element, state: ConvertState): string[] | null {
  if (!state.singletonListAsHeading) return null;
  const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li");
  if (items.length !== 1) return null;
  const li = items[0];
  const hasNestedList = Array.from(li.children).some((c) =>
    ["ul", "ol"].includes(c.tagName.toLowerCase()),
  );
  if (hasNestedList) return null;
  const text = collapseWhitespace(inlineToMarkdown(li, state)).trim();
  return text ? [`# ${text}`] : null;
}

function listToMarkdown(listEl: Element, state: ConvertState, ordered: boolean, depth: number): string {
  const lines: string[] = [];
  let index = 1;
  for (const child of Array.from(listEl.children)) {
    if (child.tagName.toLowerCase() !== "li") continue;
    lines.push(...listItemToLines(child, state, ordered ? `${index}.` : "-", depth));
    index++;
  }
  return lines.join("\n");
}

/**
 * 单元格内容可能是多段落/多图片/子列表（飞书表格里一格塞多张图很常见），
 * GFM 表格的一格只能是单行文本，因此用 `collectBlocks` 走块级切分（保留列表
 * 序号、多张图片各自独立），再用 `<br>` 拼成"看起来像多行"的单行文本——
 * 比直接拼接文本（会把 "1.""2." 编号和多张图丢得只剩一坨无分隔文字）好得多。
 */
function cellToMarkdown(cell: Element, state: ConvertState): string {
  const blocks = collectBlocks(cell, state).map((block) => block.replace(/\n+/g, "<br>"));
  return escapeTableCell(blocks.join("<br>"));
}

/** 抽取 `<table>` 的行列文本；不处理 colspan/rowspan（按既有表格模型的已知局限）。 */
function tableToRows(table: Element, state: ConvertState): string[][] {
  const rows: string[][] = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll("th, td").forEach((cell) => {
      cells.push(cellToMarkdown(cell, state));
    });
    if (cells.length > 0) rows.push(cells);
  });
  return rows;
}

function blockElementToMarkdown(el: Element, state: ConvertState): string[] {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      const text = collapseWhitespace(inlineToMarkdown(el, state)).trim();
      return text ? [`${"#".repeat(level)} ${text}`] : [];
    }
    case "p": {
      const text = collapseWhitespace(inlineToMarkdown(el, state)).trim();
      return text ? [text] : [];
    }
    case "blockquote": {
      const inner = collectBlocks(el, state).join("\n\n");
      if (!inner) return [];
      const quoted = inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return [quoted];
    }
    case "hr":
      return ["---"];
    case "ul":
    case "ol": {
      const heading = tryPromoteSingletonListToHeading(el, state);
      if (heading) return heading;
      const text = listToMarkdown(el, state, tag === "ol", 0);
      return text ? [text] : [];
    }
    case "pre": {
      const codeEl = el.querySelector("code");
      const lang = extractLangFromClassName((codeEl ?? el).className);
      const code = (codeEl ?? el).textContent ?? "";
      return [`\`\`\`${lang}\n${code.replace(/\n+$/, "")}\n\`\`\``];
    }
    case "table": {
      const rows = tableToRows(el, state);
      return rows.length > 0 ? [serializeTable(rows).trimEnd()] : [];
    }
    default:
      // div/section/article 等透明容器：递归收集子块，飞书常用一层 div 表示一行
      return collectBlocks(el, state);
  }
}

/** 按块级/行内边界把容器切成若干独立段落；连续的行内内容合并成一段。 */
function collectBlocks(container: Node, state: ConvertState): string[] {
  const blocks: string[] = [];
  let buffer = "";

  const flush = (): void => {
    const text = collapseWhitespace(buffer).trim();
    buffer = "";
    if (text) blocks.push(text);
  };

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      buffer += inlineNodeToMarkdown(child, state);
      continue;
    }
    if (!isElement(child)) continue;
    const tag = child.tagName.toLowerCase();
    if (!BLOCK_TAGS.has(tag)) {
      buffer += inlineNodeToMarkdown(child, state);
      continue;
    }
    flush();
    blocks.push(...blockElementToMarkdown(child, state));
  }
  flush();
  return blocks;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

function extFromMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? "";
}

function extFromUrlPath(url: string): string {
  try {
    const match = /\.([a-zA-Z0-9]{2,5})(?:$|\?)/.exec(new URL(url).pathname);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

function decodeDataUri(dataUri: string): { bytes: Uint8Array; ext: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUri);
  if (!match) return null;
  const mime = match[1] ?? "application/octet-stream";
  const ext = extFromMime(mime) || "png";
  try {
    if (match[2]) {
      const binary = atob(match[3] ?? "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, ext };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(match[3] ?? "")), ext };
  } catch {
    return null;
  }
}

function randomFileName(ext: string): string {
  return `pasted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

const DOWNLOAD_IMAGE_TIMEOUT_MS = 8000;

async function downloadImageToAssets(url: string, markdownFilePath: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const ext = extFromMime(blob.type) || extFromUrlPath(url) || "png";
    return await savePastedImage(markdownFilePath, randomFileName(ext), new Uint8Array(buffer));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析单张粘贴图片的最终 Markdown 语法。
 * - `data:`：直接解码落盘到 assets
 * - `http(s):`：尝试下载落盘；很多站点的图片有防盗链/需要登录态，下载失败时
 *   保留原始外链——`<img>` 标签直接展示外链通常不受 CORS 限制，仍有机会显示
 * - 其它（如 `blob:`、相对路径）：原样写出，无法在粘贴时可靠解析
 */
async function resolveImageMarkdown(
  rawSrc: string,
  rawAlt: string,
  ctx: HtmlPasteContext,
): Promise<string> {
  const src = rawSrc.trim();
  const alt = escapeInlineText(collapseWhitespace(rawAlt).trim());
  if (!src) return alt;
  if (src.startsWith("data:")) {
    const decoded = decodeDataUri(src);
    if (!decoded) return alt;
    try {
      const relativePath = await savePastedImage(
        ctx.markdownFilePath,
        randomFileName(decoded.ext),
        decoded.bytes,
      );
      return `![${alt}](${relativePath})`;
    } catch (err) {
      console.warn("[markmfy] 保存粘贴图片失败", err);
      return alt;
    }
  }
  if (/^https?:\/\//i.test(src)) {
    try {
      const relativePath = await downloadImageToAssets(src, ctx.markdownFilePath);
      return `![${alt}](${relativePath})`;
    } catch (err) {
      console.warn("[markmfy] 下载粘贴图片失败，保留原始链接", src, err);
      return `![${alt}](${src})`;
    }
  }
  return `![${alt}](${src})`;
}

async function resolveImages(
  markdown: string,
  images: PendingImage[],
  ctx: HtmlPasteContext,
): Promise<string> {
  // 并发解析（下载/落盘互不依赖），避免多图片时逐个等待导致粘贴长时间无响应
  const replacements = await Promise.all(
    images.map((image) => resolveImageMarkdown(image.src, image.alt, ctx)),
  );
  let out = markdown;
  images.forEach((image, i) => {
    out = out.split(image.token).join(replacements[i]);
  });
  return out;
}

/** 把 HTML 片段转换为 Markdown 文本；转换失败或没有可用内容时返回空字符串。 */
export async function convertHtmlToMarkdown(html: string, ctx: HtmlPasteContext): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const state: ConvertState = {
    images: [],
    seq: 0,
    singletonListAsHeading: looksLikeFeishuHtml(html),
  };
  const blocks = collectBlocks(doc.body, state);
  if (blocks.length === 0) return "";
  return resolveImages(blocks.join("\n\n"), state.images, ctx);
}
