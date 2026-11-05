/**
 * Live Preview：受控 HTML 行内/块级样式（工具栏写入的 u/sup/sub/span/div）。
 * 不依赖 lezer 成对节点（HTMLTag 是兄弟节点），用正则在可见范围内匹配。
 */
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";

function isCursorTouching(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => {
    if (r.empty) return r.from >= from && r.from < to;
    return r.from < to && r.to > from;
  });
}

function hideRange(ranges: Range<Decoration>[], from: number, to: number): void {
  if (to > from) {
    ranges.push(Decoration.mark({ class: "mm-hide-mark" }).range(from, to));
  }
}

const SIMPLE_TAG_RE = /<(u|sup|sub)>([\s\S]*?)<\/\1>/gi;
const SPAN_RE = /<span\s+style="([^"]*)">([\s\S]*?)<\/span>/gi;
const DIV_ALIGN_RE =
  /<div\s+style="text-align:\s*(left|center|right|justify);?\s*">([\s\S]*?)<\/div>/gi;

const ALLOWED_STYLE_KEYS = new Set([
  "color",
  "background-color",
  "font-size",
  "line-height",
  "text-align",
]);

/** 过滤 style 字符串，只保留白名单属性。 */
export function sanitizeInlineStyle(raw: string): string {
  const parts: string[] = [];
  for (const part of raw.split(";")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_KEYS.has(key) || !val) continue;
    // 拒绝 url( / expression / javascript
    if (/url\s*\(|expression\s*\(|javascript:/i.test(val)) continue;
    parts.push(`${key}: ${val}`);
  }
  return parts.join("; ");
}

function decorateSimpleTags(
  state: EditorState,
  from: number,
  text: string,
  ranges: Range<Decoration>[],
): void {
  SIMPLE_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SIMPLE_TAG_RE.exec(text))) {
    const absFrom = from + m.index;
    const absTo = absFrom + m[0].length;
    if (isCursorTouching(state, absFrom, absTo)) continue;
    const tag = (m[1] ?? "u").toLowerCase();
    const openLen = tag.length + 2; // <tag>
    const closeLen = tag.length + 3; // </tag>
    hideRange(ranges, absFrom, absFrom + openLen);
    hideRange(ranges, absTo - closeLen, absTo);
    const contentFrom = absFrom + openLen;
    const contentTo = absTo - closeLen;
    if (contentTo > contentFrom) {
      ranges.push(Decoration.mark({ class: `mm-html-${tag}` }).range(contentFrom, contentTo));
    }
  }
}

function decorateSpans(
  _state: EditorState,
  from: number,
  text: string,
  ranges: Range<Decoration>[],
): void {
  SPAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPAN_RE.exec(text))) {
    const absFrom = from + m.index;
    const absTo = absFrom + m[0].length;
    // span 样式不因光标进入而展开源码：徽标常显、标签始终隐藏，
    // 直接点击样式文字就是普通编辑（想看源码走源码编辑模式）。
    const styleRaw = m[1] ?? "";
    const style = sanitizeInlineStyle(styleRaw);
    const openLen = m[0].indexOf(">") + 1;
    const closeLen = "</span>".length;
    // 开头标签渲染成可双击的样式徽标（双击选中整个 span 内容，便于再次套用/取消样式）
    ranges.push(
      Decoration.replace({
        widget: new SpanBadgeWidget(style, absFrom + openLen, absTo - closeLen),
      }).range(absFrom, absFrom + openLen),
    );
    hideRange(ranges, absTo - closeLen, absTo);
    const contentFrom = absFrom + openLen;
    const contentTo = absTo - closeLen;
    if (contentTo > contentFrom) {
      ranges.push(
        Decoration.mark({
          class: "mm-html-span",
          attributes: style ? { style } : undefined,
        }).range(contentFrom, contentTo),
      );
    }
  }
}

/**
 * `<span style="...">` 开头标签的样式徽标：显示字号（如 16）或颜色小色块。
 * 双击徽标选中整个 span 内容（处理逻辑在 livePreview.ts 的 dblclick handler）。
 */
class SpanBadgeWidget extends WidgetType {
  constructor(
    private readonly style: string,
    private readonly contentFrom: number,
    private readonly contentTo: number,
  ) {
    super();
  }

  eq(other: SpanBadgeWidget): boolean {
    return (
      other.style === this.style &&
      other.contentFrom === this.contentFrom &&
      other.contentTo === this.contentTo
    );
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "mm-style-badge";
    const entries = this.style ? this.style.split(";") : [];
    let label = "A";
    let badgeColor = "";
    for (const entry of entries) {
      const idx = entry.indexOf(":");
      if (idx <= 0) continue;
      const key = entry.slice(0, idx).trim();
      const val = entry.slice(idx + 1).trim();
      if (key === "font-size") {
        const px = val.match(/(\d+(?:\.\d+)?)\s*px/i);
        if (px) label = `${px[1]}`;
      } else if (key === "color" && !badgeColor) {
        badgeColor = val;
      }
    }
    el.textContent = label;
    if (badgeColor) {
      const swatch = document.createElement("i");
      swatch.className = "mm-style-badge__swatch";
      swatch.style.background = badgeColor;
      el.appendChild(swatch);
    }
    el.dataset.spanFrom = String(this.contentFrom);
    el.dataset.spanTo = String(this.contentTo);
    el.title = this.style;
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function decorateAlignDivs(
  state: EditorState,
  from: number,
  text: string,
  ranges: Range<Decoration>[],
): void {
  DIV_ALIGN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIV_ALIGN_RE.exec(text))) {
    const absFrom = from + m.index;
    const absTo = absFrom + m[0].length;
    if (isCursorTouching(state, absFrom, absTo)) continue;
    const align = (m[1] ?? "left").toLowerCase();
    const openLen = m[0].indexOf(">") + 1;
    const closeLen = "</div>".length;
    hideRange(ranges, absFrom, absFrom + openLen);
    hideRange(ranges, absTo - closeLen, absTo);
    const contentFrom = absFrom + openLen;
    const contentTo = absTo - closeLen;
    if (contentTo > contentFrom) {
      ranges.push(
        Decoration.mark({
          class: "mm-html-align",
          attributes: { style: `text-align: ${align}; display: block;` },
        }).range(contentFrom, contentTo),
      );
    }
  }
}

/** 在 [from, to) 文档切片上叠加受控 HTML 预览装饰。 */
export function decorateControlledHtml(
  state: EditorState,
  from: number,
  to: number,
  ranges: Range<Decoration>[],
): void {
  if (to <= from) return;
  const text = state.doc.sliceString(from, to);
  decorateSimpleTags(state, from, text, ranges);
  decorateSpans(state, from, text, ranges);
  decorateAlignDivs(state, from, text, ranges);
}
