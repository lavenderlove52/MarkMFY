/**
 * Typora/Obsidian style Markdown Live Preview.
 *
 * Two separate decoration sources are combined here, because CodeMirror 6 only allows
 * `block: true` decorations (Decoration.replace/widget used to fully replace a Table /
 * Mermaid fenced code / HorizontalRule line) to be provided via a `StateField`, NOT via a
 * `ViewPlugin` (attempting to do so throws "Block decorations may not be specified via
 * plugins" and crashes the whole editor view).
 *
 * - Inline-level decorations (headings, bold/italic/code marks, links, images, blockquote
 *   lines, list bullets, task checkboxes) are computed by a `ViewPlugin`, restricted to
 *   `view.visibleRanges` for large-file performance.
 * - Block-level "replace this whole node with a widget" decorations (Table, Mermaid /
 *   plain fenced code, BlockMath, HorizontalRule) are computed by a `StateField` over the full
 *   document, recomputed on doc/tree/source-edit changes（纯 selection 移动不再全量 rebuild，
 *   但光标进出 BlockMath 时会局部触发重建以切换源码/预览）.
 *
 * 标题行：默认始终隐藏 `#` 并保持标题样式，可在预览态直接改正文；双击该行才进入源码态。
 * 其它多数节点：光标进入显示原始语法，离开恢复渲染。
 *
 * Node names verified against @lezer/markdown with GFM extensions.
 */
import {
  EditorSelection,
  EditorState,
  Facet,
  Prec,
  StateField,
  type Extension,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BulletWidget,
  CheckboxWidget,
  HrWidget,
  ImageWidget,
  MermaidWidget,
  CodeBlockWidget,
  MathWidget,
  TableWidget,
  type TableCellData,
} from "./widgets";
import {
  codeBlockBodyFocusField,
  markTemporaryLeadingParagraph,
  requestCodeBlockBodyFocus,
  temporaryLeadingParagraphField,
} from "./codeBlockWidget";
import { normalizeCodeBody, parseFenceInfo } from "./codeBlockModel";
import { extractMathTex } from "../language/mathExtension";
import { parseTableMetaLine, type TableLayout } from "./tableModel";
import { parseMermaidMetaLine, type MermaidViewPrefs } from "./mermaidModel";
import {
  blockSourceEditField,
  clearBlockSourceEdit,
  isBlockInSourceEdit,
  isTableInSourceEdit,
  requestBlockSourceEdit,
  tableSourceEditField,
} from "./blockSourceEdit";
import { decorateControlledHtml } from "./htmlPreview";

export type ResolveImageSrc = (rawPath: string) => string;

/**
 * `blockDecorationsField` 是模块级 StateField（非按 view 创建），拿不到
 * `livePreviewExtension(resolveImageSrc)` 的闭包参数，因此用 Facet 传递，
 * 让表格 Widget 也能像正文一样把相对路径图片解析成可加载的 URL。
 */
const resolveTableImageSrcFacet = Facet.define<ResolveImageSrc, ResolveImageSrc>({
  combine: (values) => values[values.length - 1] ?? ((p) => p),
});

const HEADING_NAMES = [
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
];

function isCursorTouching(state: EditorState, from: number, to: number): boolean {
  // 空光标落在 [from, to) 内也要算“正在编辑”，否则点击 Widget 把光标放进块后仍显示预览、无法改源码。
  return state.selection.ranges.some((r) => {
    if (r.empty) return r.from >= from && r.from < to;
    return r.from < to && r.to > from;
  });
}

function isCursorOnLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from);
}

/**
 * CM6 要求 block widget 的 range 必须覆盖完整行（起止都在换行边界），
 * 否则 decoration 会被静默丢弃——这是表格/Mermaid 之前不显示的主要原因。
 */
function blockWidgetRange(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  const start = state.doc.lineAt(from).from;
  const endLine = state.doc.lineAt(Math.max(from, to > from ? to - 1 : to));
  const end = endLine.to < state.doc.length ? endLine.to + 1 : endLine.to;
  return { from: start, to: end };
}

/**
 * 折叠一段行内 Markdown 语法标记（**、`、>、[]() 等）。
 *
 * 故意不用 `Decoration.replace({})`（无 widget 的空替换）：这种“无 DOM 留存”的隐藏方式
 * 会让 posAtCoords / moveVertically 在该范围内失去可命中的锚点，具体表现为点击命中相邻行、
 * 或按上下键直接跳过整行。标题标记（HeaderMark）此前已发现并改用 mark 折叠修复过一次，
 * 但粗斜体/行内代码/引用/链接等其它标记当时沿用了旧的 replace 方式，是同一根因的遗留点。
 * 统一改成 `mark` + CSS 折叠（保留零宽但存在的 DOM 节点）可从根本上避免这整类问题。
 */
function hideRange(ranges: Range<Decoration>[], from: number, to: number): void {
  if (to > from) {
    ranges.push(Decoration.mark({ class: "mm-hide-mark" }).range(from, to));
  }
}

function markRange(
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>,
): void {
  if (to > from) {
    ranges.push(Decoration.mark({ class: className, attributes }).range(from, to));
  }
}

function isPreviewWidgetTarget(target: Element): boolean {
  return !!target.closest(
    "button, a, input, textarea, select, .mm-table-wrap, .mm-mermaid, .mm-image-wrap, .mm-code-block, .mm-math",
  );
}

function posFromDomPoint(view: EditorView, lineEl: Element, event: MouseEvent): number | null {
  try {
    const lineStart = view.posAtDOM(lineEl, 0);
    const line = view.state.doc.lineAt(lineStart);
    if (line.from === line.to) return line.from;

    // 先遍历行内真实可见文本节点，按鼠标位置找最近字符边界。
    // 这条路径能跳过被零宽 CSS 折叠的 Markdown 标记，避免行内代码前的
    // 反引号、列表标记等把锚点错误地拉回行首。
    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
    let bestPos: number | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text) || !node.data) continue;
      if (node.parentElement?.closest(".mm-hide-mark")) continue;
      const charRange = document.createRange();
      for (let i = 0; i < node.data.length; i++) {
        charRange.setStart(node, i);
        charRange.setEnd(node, Math.min(i + 1, node.data.length));
        const rect = charRange.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const dx =
          event.clientX < rect.left
            ? rect.left - event.clientX
            : event.clientX > rect.right
              ? event.clientX - rect.right
              : 0;
        const dy =
          event.clientY < rect.top
            ? rect.top - event.clientY
            : event.clientY > rect.bottom
              ? event.clientY - rect.bottom
              : 0;
        const score = dx + dy * 4;
        if (score >= bestScore) continue;
        const offset = event.clientX < rect.left + rect.width / 2 ? i : i + 1;
        try {
          const pos = view.posAtDOM(node, offset);
          if (pos >= line.from && pos <= line.to) {
            bestPos = pos;
            bestScore = score;
          }
        } catch {
          // 继续尝试其它可见文本节点。
        }
      }
      charRange.detach();
    }
    if (bestPos != null) return bestPos;

    // 优先用 DOM Range 命中可见文本节点。行内代码等语法标记被零宽装饰覆盖时，
    // 单纯按文档位置二分容易把可见文字起点算到隐藏反引号之前。
    const doc = document as Document & {
      caretRangeFromPoint?: (
        x: number,
        y: number,
      ) => { startContainer: Node; startOffset: number } | null;
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range && lineEl.contains(range.startContainer)) {
      const pos = view.posAtDOM(range.startContainer, range.startOffset);
      if (pos >= line.from && pos <= line.to) return pos;
    } else {
      const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
      if (caret && lineEl.contains(caret.offsetNode)) {
        const pos = view.posAtDOM(caret.offsetNode, caret.offset);
        if (pos >= line.from && pos <= line.to) return pos;
      }
    }

    // 最后兜底：按字符矩形横向二分。
    let low = line.from;
    let high = Math.max(line.from, line.to - 1);
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const coords = view.coordsAtPos(mid);
      if (!coords) return null;
      if (coords.right < event.clientX) low = mid + 1;
      else high = mid;
    }
    const coords = view.coordsAtPos(low);
    if (!coords) return low;
    const center = (coords.left + coords.right) / 2;
    return event.clientX < center ? low : Math.min(low + 1, line.to);
  } catch {
    return null;
  }
}

/**
 * 拖拽时鼠标可能离开文字本身（例如越过首字继续向左或进入行间空白），
 * elementFromPoint 就找不到 `.cm-line`。这里按纵坐标选择最近的普通文本行，
 * 再把横坐标映射到该行的字符位置，避免选区在文字边缘中断。
 */
function findTextLineAtPoint(view: EditorView, x: number, y: number): Element | null {
  const direct = document.elementFromPoint(x, y);
  if (direct instanceof Element) {
    const lineEl = direct.closest(".cm-line");
    if (lineEl && view.contentDOM.contains(lineEl) && !isPreviewWidgetTarget(lineEl)) {
      return lineEl;
    }
  }

  let nearest: Element | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const lineEl of view.contentDOM.querySelectorAll(".cm-line")) {
    if (isPreviewWidgetTarget(lineEl)) continue;
    const rect = lineEl.getBoundingClientRect();
    if (rect.height === 0) continue;
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (distance < nearestDistance) {
      nearest = lineEl;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * 普通文本行点击修正：当上方块级 Widget 高度缓存短暂过期时，CM6 的
 * `posAtCoords` 可能把鼠标所在段落映射到下面的代码块/表格源码位置。
 * 这里用实际命中的 `.cm-line` DOM 做校验，只在坐标映射落到其它行时接管。
 *
 * 必须在 mousedown 里 preventDefault 并立刻改选区，否则光标会先落到错误行；
 * 同时挂上临时 mousemove，保证仍可从正确落点拖拽选区。
 */
function extendSelectionFromDom(view: EditorView, startAnchor: number, event: MouseEvent): void {
  let head: number | null = null;
  const lineEl = findTextLineAtPoint(view, event.clientX, event.clientY);
  if (lineEl) {
    head = posFromDomPoint(view, lineEl, event);
  }
  if (head == null) {
    head = view.posAtCoords({ x: event.clientX, y: event.clientY });
  }
  if (head == null) return;
  view.dispatch({
    selection: { anchor: startAnchor, head },
    scrollIntoView: true,
  });
}

function installDragSelect(view: EditorView, startAnchor: number, startEvent: MouseEvent): void {
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  let dragging = false;

  const onMove = (e: MouseEvent): void => {
    if ((e.buttons & 1) === 0) return;
    if (!dragging) {
      if (Math.abs(e.clientX - startX) < 3 && Math.abs(e.clientY - startY) < 3) return;
      dragging = true;
    }
    e.preventDefault();
    extendSelectionFromDom(view, startAnchor, e);
  };

  const onUp = (): void => {
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
}

function handleTextLineMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element) || isPreviewWidgetTarget(target)) return false;

  const lineEl = target.closest(".cm-line");
  if (!lineEl || !view.contentDOM.contains(lineEl)) return false;

  let domLine;
  try {
    domLine = view.state.doc.lineAt(view.posAtDOM(lineEl, 0));
  } catch {
    return false;
  }

  const mappedPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (mappedPos != null) {
    const mappedLine = view.state.doc.lineAt(mappedPos);
    if (mappedLine.number === domLine.number) return false;
  }

  const anchorRaw = posFromDomPoint(view, lineEl, event);
  if (anchorRaw == null) return false;
  const anchor = Math.max(domLine.from, Math.min(anchorRaw, domLine.to));

  event.preventDefault();
  view.dispatch({
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
  // 顺带触发重测，缓解块级 Widget 高度缓存过期
  view.requestMeasure();
  installDragSelect(view, anchor, event);
  return true;
}

/** 标题行 `[from, to)`（含末尾换行），供源码态 range 使用。 */
function headingLineRange(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos);
  const to = line.to < state.doc.length ? line.to + 1 : line.to;
  return { from: line.from, to };
}

/**
 * 标题正文起点（跳过 `#` 与紧随空格）；非标题行或尚未完成标题语法时返回 null。
 *
 * Lezer 会把单独的 `#`～`######` 也解析成 ATX 标题。若此时进入预览态，HeaderMark
 * 会被完全折叠，用户刚输入的 `#` 会看起来消失，甚至难以继续组合标题级别。
 * 单独的 `#` 是输入中的标题，保持源码可见；输入空格后才视为标题语法完成并渲染。
 */
function headingContentStart(state: EditorState, lineFrom: number, lineTo: number): number | null {
  let contentStart: number | null = null;
  let hasSpaceAfterMark = false;
  syntaxTree(state).iterate({
    from: lineFrom,
    to: lineTo,
    enter(node) {
      if (!HEADING_NAMES.includes(node.name)) return;
      const headerMark = node.node.getChild("HeaderMark");
      if (headerMark) {
        hasSpaceAfterMark = state.doc.sliceString(headerMark.to, headerMark.to + 1) === " ";
        contentStart = headerMark.to + (hasSpaceAfterMark ? 1 : 0);
      } else {
        contentStart = node.from;
      }
      return false;
    },
  });
  if (contentStart == null || (!hasSpaceAfterMark && contentStart === lineTo)) {
    return null;
  }
  return contentStart;
}

function isHeadingLineInSourceEdit(state: EditorState, pos: number): boolean {
  const { from, to } = headingLineRange(state, pos);
  return isBlockInSourceEdit(state, from, to);
}

/**
 * 预览态下把落在 HeaderMark（含其后空格）内的光标夹到正文，
 * 避免打开文件时光标在行首导致 caret 落在隐藏 `#` 上不可见。
 */
function clampPosOutOfHeaderMark(state: EditorState, pos: number): number {
  if (state.doc.length === 0) return 0;
  if (pos < 0 || pos > state.doc.length) return pos;
  const line = state.doc.lineAt(Math.min(pos, Math.max(0, state.doc.length - 1)));
  if (isHeadingLineInSourceEdit(state, line.from)) return pos;
  const contentStart = headingContentStart(state, line.from, line.to);
  if (contentStart == null) return pos;
  if (pos >= line.from && pos < contentStart) return contentStart;
  return pos;
}

function handleHeading(node: SyntaxNodeRef, state: EditorState, ranges: Range<Decoration>[]): void {
  const level = HEADING_NAMES.indexOf(node.name) + 1;
  const line = state.doc.lineAt(node.from);

  // 输入中的标题（如单独输入 #～######）没有正文时保持源码可见，
  // 否则 HeaderMark 被折叠后整行看起来像没有输入任何内容。
  if (headingContentStart(state, line.from, line.to) == null) return;

  // 仅双击进入的源码态才露出 `#`；光标在标题行仍保持预览样式
  if (isHeadingLineInSourceEdit(state, line.from)) return;

  ranges.push(Decoration.line({ class: `mm-h${level}` }).range(line.from));

  const headerMark = node.node.getChild("HeaderMark");
  if (headerMark) {
    const hasSpaceAfter = state.doc.sliceString(headerMark.to, headerMark.to + 1) === " ";
    hideRange(ranges, headerMark.from, headerMark.to + (hasSpaceAfter ? 1 : 0));
  }
}

const HEADING_LINE_SELECTOR =
  ".cm-line.mm-h1, .cm-line.mm-h2, .cm-line.mm-h3, .cm-line.mm-h4, .cm-line.mm-h5, .cm-line.mm-h6";

/**
 * 按实际 DOM/纵向命中找标题行。大字号标题下 posAtCoords 常偏到下一行，
 * 导致双击 H2 却把 H3 切进源码态。
 */
function findHeadingLineAtPointer(
  view: EditorView,
  event: MouseEvent,
): { lineFrom: number; lineTo: number; rangeFrom: number; rangeTo: number } | null {
  const target = event.target;
  let lineEl: Element | null =
    target instanceof Element ? target.closest(HEADING_LINE_SELECTOR) : null;

  if (!lineEl || !view.contentDOM.contains(lineEl)) {
    let best: { el: Element; dist: number } | null = null;
    for (const el of view.contentDOM.querySelectorAll(HEADING_LINE_SELECTOR)) {
      const rect = el.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom) continue;
      const dist = Math.abs((rect.top + rect.bottom) / 2 - event.clientY);
      if (!best || dist < best.dist) best = { el, dist };
    }
    lineEl = best?.el ?? null;
  }

  if (lineEl) {
    try {
      const line = view.state.doc.lineAt(view.posAtDOM(lineEl, 0));
      if (headingContentStart(view.state, line.from, line.to) != null) {
        const { from, to } = headingLineRange(view.state, line.from);
        return { lineFrom: line.from, lineTo: line.to, rangeFrom: from, rangeTo: to };
      }
    } catch {
      /* 再走语法树回退 */
    }
  }

  // 源码态下没有 mm-h*：用各标题行的屏幕坐标匹配
  const best = {
    lineFrom: -1,
    lineTo: -1,
    rangeFrom: -1,
    rangeTo: -1,
    dist: Number.POSITIVE_INFINITY,
  };
  for (const range of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        if (!HEADING_NAMES.includes(node.name)) return;
        const line = view.state.doc.lineAt(node.from);
        const coords = view.coordsAtPos(line.from);
        const coordsEnd = view.coordsAtPos(line.to);
        if (!coords || !coordsEnd) return;
        const top = Math.min(coords.top, coordsEnd.top);
        const bottom = Math.max(coords.bottom, coordsEnd.bottom);
        if (event.clientY < top || event.clientY > bottom) return;
        const dist = Math.abs((top + bottom) / 2 - event.clientY);
        if (dist >= best.dist) return false;
        const { from, to } = headingLineRange(view.state, line.from);
        best.lineFrom = line.from;
        best.lineTo = line.to;
        best.rangeFrom = from;
        best.rangeTo = to;
        best.dist = dist;
        return false;
      },
    });
  }
  if (best.lineFrom < 0) return null;
  return {
    lineFrom: best.lineFrom,
    lineTo: best.lineTo,
    rangeFrom: best.rangeFrom,
    rangeTo: best.rangeTo,
  };
}

/** 双击标题行 → 进入 Markdown 源码编辑态（显示 `#`）。 */
function handleHeadingDblClick(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element) || isPreviewWidgetTarget(target)) return false;

  const hit = findHeadingLineAtPointer(view, event);
  if (!hit) return false;

  if (isBlockInSourceEdit(view.state, hit.rangeFrom, hit.rangeTo)) return false;

  const contentStart = headingContentStart(view.state, hit.lineFrom, hit.lineTo) ?? hit.lineFrom;
  const midY = (() => {
    const c0 = view.coordsAtPos(hit.lineFrom);
    const c1 = view.coordsAtPos(hit.lineTo);
    if (c0 && c1) return (Math.min(c0.top, c1.top) + Math.max(c0.bottom, c1.bottom)) / 2;
    return event.clientY;
  })();
  let clickPos = view.posAtCoords({ x: event.clientX, y: midY });
  if (clickPos == null || clickPos < hit.lineFrom || clickPos > hit.lineTo) {
    clickPos = contentStart;
  }

  event.preventDefault();
  view.dispatch({
    effects: requestBlockSourceEdit.of({ from: hit.rangeFrom, to: hit.rangeTo }),
    selection: { anchor: Math.max(hit.lineFrom, Math.min(clickPos, hit.lineTo)) },
    scrollIntoView: true,
  });
  view.focus();
  view.requestMeasure();
  return true;
}

/**
 * 双击行内样式 → 把对应 Markdown 节点切到源码态。
 * 标题内的行内样式由 `handleHeadingDblClick` 优先处理为整行源码态。
 */
function handleInlineMarkDblClick(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const markEl = target.closest(".mm-bold, .mm-italic, .mm-strikethrough, .mm-inline-code");
  if (!markEl) return false;

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return false;
  const expectedNode = markEl.classList.contains("mm-bold")
    ? "StrongEmphasis"
    : markEl.classList.contains("mm-italic")
      ? "Emphasis"
      : markEl.classList.contains("mm-strikethrough")
        ? "Strikethrough"
        : "InlineCode";
  const sourceFrom = Number(markEl.getAttribute("data-mm-inline-from"));
  const sourceTo = Number(markEl.getAttribute("data-mm-inline-to"));
  let range: { from: number; to: number } | null =
    Number.isFinite(sourceFrom) &&
    Number.isFinite(sourceTo) &&
    sourceFrom >= 0 &&
    sourceTo > sourceFrom &&
    sourceTo <= view.state.doc.length
      ? { from: sourceFrom, to: sourceTo }
      : null;
  if (!range) {
    syntaxTree(view.state).iterate({
      from: Math.max(0, pos - 1),
      to: Math.min(view.state.doc.length, pos + 1),
      enter(node) {
        if (node.name === expectedNode) {
          range = { from: node.from, to: node.to };
          return false;
        }
        return undefined;
      },
    });
  }
  if (!range) return false;

  const anchor = Math.max(range.from + 1, Math.min(pos, range.to - 1));
  event.preventDefault();
  view.dispatch({
    effects: requestBlockSourceEdit.of(range),
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
  view.requestMeasure();
  return true;
}

/** 标题行鼠标命中修正：字号放大后点击常落到邻行，键盘却能进来。 */
function handleHeadingMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (isPreviewWidgetTarget(target)) return false;

  const hit = findHeadingLineAtPointer(view, event);
  if (!hit) return false;

  const lineFrom = hit.lineFrom;
  const lineTo = hit.lineTo;
  const lineEl = target.closest(".cm-line");
  const exactAnchor = lineEl ? posFromDomPoint(view, lineEl, event) : null;
  const contentStart = headingContentStart(view.state, lineFrom, lineTo) ?? lineFrom;
  const rawMappedPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const rawMappedSameLine =
    rawMappedPos != null &&
    view.state.doc.lineAt(rawMappedPos).number === view.state.doc.lineAt(lineFrom).number;

  // 可见标题正文且坐标行正确时，完全交回 CodeMirror 原生选区。
  // 之前这里只要旧选区不在标题行就接管，会把含行内代码的标题锚点夹回正文起点，
  // 表现为从可见文字中间开始拖动却自动带上左侧全部内容。
  if (rawMappedSameLine && exactAnchor != null && exactAnchor >= contentStart) {
    return false;
  }

  // midY 必须取标题行 DOM 元素的几何中心：coordsAtPos(lineTo) 在字号放大的标题上
  // 会给出偏下甚至落进下一行命中区的坐标，posAtCoords 反查回来就越过 lineTo，
  // 导致 anchor 被 fallback 钉死在 contentStart（表现为“标题正文点哪都只能点到行首”）。
  const midY = (() => {
    if (lineEl) {
      const rect = lineEl.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }
    const c0 = view.coordsAtPos(lineFrom);
    const c1 = view.coordsAtPos(lineTo);
    if (c0 && c1) return (Math.min(c0.top, c1.top) + Math.max(c0.bottom, c1.bottom)) / 2;
    return event.clientY;
  })();
  let clickPos = view.posAtCoords({ x: event.clientX, y: midY });
  if (clickPos == null || clickPos < lineFrom || clickPos > lineTo) {
    clickPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  }

  const mappedOk = clickPos != null && clickPos >= lineFrom && clickPos <= lineTo;
  // 要求选区与标题行正文有真正重叠（而非仅“覆盖过第 0 字符”），否则任何位置
  // 的旧选区都会被误判成 alreadyOnLine，把本应修正的点击放行给 CM 默认行为。
  const alreadyOnLine =
    mappedOk && view.state.selection.ranges.some((r) => r.from <= lineTo && r.to >= contentStart);

  // 已点在标题行正文上且选区已正确时交给 CM 默认行为
  if (mappedOk && alreadyOnLine && clickPos! >= contentStart) {
    return false;
  }

  const anchor =
    exactAnchor != null
      ? Math.max(exactAnchor, contentStart)
      : mappedOk
        ? Math.max(clickPos!, contentStart)
        : contentStart;
  event.preventDefault();
  view.dispatch({
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
  view.requestMeasure();
  installDragSelect(view, anchor, event);
  return true;
}

function handleInlineMarks(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
  markName: string,
  contentClass: string,
  revealOnCursor = true,
): void {
  const sourceRange = state.field(blockSourceEditField, false);
  if (sourceRange && sourceRange.from <= node.from && node.to <= sourceRange.to) return;
  const active = revealOnCursor && isCursorTouching(state, node.from, node.to);
  if (active) return;

  const marks = node.node.getChildren(markName);
  if (marks.length < 2) return;
  const open = marks[0];
  const close = marks[marks.length - 1];

  hideRange(ranges, open.from, open.to);
  hideRange(ranges, close.from, close.to);
  markRange(ranges, open.to, close.from, contentClass, {
    "data-mm-inline-from": String(node.from),
    "data-mm-inline-to": String(node.to),
  });
}

function handleBlockquoteLine(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const active = isCursorOnLine(state, node.from);
  if (active) return;
  const hasSpaceAfter = state.doc.sliceString(node.to, node.to + 1) === " ";
  if (!hasSpaceAfter) return;
  hideRange(ranges, node.from, node.to + (hasSpaceAfter ? 1 : 0));
}

function handleHorizontalRule(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const { from, to } = blockWidgetRange(state, node.from, node.to);
  // 与表格/代码块一致：仅显式源码态才露 `---`；靠光标进出无效（block 装饰不随纯 selection 重建）
  if (isBlockInSourceEdit(state, from, to) || isBlockInSourceEdit(state, node.from, node.to)) {
    markSourceEditing(state, node.from, node.to, ranges);
    return;
  }
  ranges.push(Decoration.replace({ widget: new HrWidget(from, to), block: true }).range(from, to));
}

function handleListMark(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const text = state.doc.sliceString(node.from, node.to).trim();
  const active = isCursorTouching(state, node.from, node.to);
  if (active) return;
  if (state.doc.sliceString(node.to, node.to + 1) !== " ") return;
  if (text === "-" || text === "*" || text === "+") {
    ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
  } else {
    markRange(ranges, node.from, node.to, "mm-list-mark");
  }
}

function handleTaskMarker(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const text = state.doc.sliceString(node.from, node.to);
  const checked = text === "[x]" || text === "[X]";
  ranges.push(
    Decoration.replace({ widget: new CheckboxWidget(checked, node.from, node.to) }).range(
      node.from,
      node.to,
    ),
  );
}

function handleLink(node: SyntaxNodeRef, state: EditorState, ranges: Range<Decoration>[]): void {
  const active = isCursorTouching(state, node.from, node.to);
  if (active) return;

  const marks = node.node.getChildren("LinkMark");
  if (marks.length < 4) return;
  const [openBracket, closeBracket, , closeParen] = marks;

  hideRange(ranges, node.from, openBracket.to);
  hideRange(ranges, closeBracket.from, closeParen.to);
  markRange(ranges, openBracket.to, closeBracket.from, "mm-link");
}

function handleImage(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
  resolveImageSrc: ResolveImageSrc,
): boolean {
  if (isCursorTouching(state, node.from, node.to)) return false;

  const urlNode = node.node.getChild("URL");
  if (!urlNode) return false;

  const marks = node.node.getChildren("LinkMark");
  let alt = "";
  if (marks.length >= 2) {
    alt = state.doc.sliceString(marks[0].to, marks[1].from);
  }
  const rawPath = state.doc.sliceString(urlNode.from, urlNode.to).trim();
  if (!rawPath) return false;

  // 图片常出现在段落中间，必须用 inline replace，不能 block 整行
  ranges.push(
    Decoration.replace({
      widget: new ImageWidget(resolveImageSrc(rawPath), alt),
    }).range(node.from, node.to),
  );
  return true;
}

function handleInlineMath(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): boolean {
  if (isCursorTouching(state, node.from, node.to)) return false;
  const raw = state.doc.sliceString(node.from, node.to);
  const tex = extractMathTex(raw, false);
  if (!tex) return false;
  ranges.push(
    Decoration.replace({
      widget: new MathWidget(tex, false),
    }).range(node.from, node.to),
  );
  return true;
}

function handleBlockMath(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): boolean {
  if (isCursorTouching(state, node.from, node.to)) return false;
  const { from, to } = blockWidgetRange(state, node.from, node.to);
  const raw = state.doc.sliceString(node.from, node.to);
  const tex = extractMathTex(raw, true);
  if (!tex) return false;
  ranges.push(
    Decoration.replace({
      widget: new MathWidget(tex, true),
      block: true,
    }).range(from, to),
  );
  return true;
}

/**
 * 按未转义 `|` 把表格一行的原文切分成单元格。
 * 不能靠语法树的 TableCell 节点：@lezer/markdown 对完全为空的单元格不生成任何节点
 * （新增行 `|  |  |` 整行没有一个 TableCell），而「+列」产生的空尾单元格同样会消失，
 * 导致表格 Widget 重建后新行列凭空蒸发——表现为点了按钮没反应。
 */
function splitTableRowText(lineText: string): string[] {
  let text = lineText.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      current += "\\|";
      i++;
    } else if (ch === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseTableRows(state: EditorState, tableNode: SyntaxNodeRef): TableCellData[][] {
  const rows: TableCellData[][] = [];
  for (let child = tableNode.node.firstChild; child; child = child.nextSibling) {
    if (child.name !== "TableHeader" && child.name !== "TableRow") continue;
    const isHeader = child.name === "TableHeader";
    const lineText = state.doc.lineAt(child.from).text;
    const cells = splitTableRowText(lineText).map((text) => ({ text, isHeader }));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** 表格后紧跟的 `<!-- markmfy-table: {...} -->` 宽高注释一并纳入替换范围。 */
function extendTableRangeWithMeta(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number; layout: TableLayout | null } {
  if (to >= state.doc.length) return { from, to, layout: null };
  const line = state.doc.lineAt(to);
  if (line.from !== to) return { from, to, layout: null };
  const layout = parseTableMetaLine(line.text);
  if (!layout) return { from, to, layout: null };
  const end = line.to < state.doc.length ? line.to + 1 : line.to;
  return { from, to: end, layout };
}

/** Mermaid 代码块后紧跟的缩放/字号注释一并纳入替换范围。 */
function extendMermaidRangeWithMeta(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number; prefs: MermaidViewPrefs | null } {
  if (to >= state.doc.length) return { from, to, prefs: null };
  const line = state.doc.lineAt(to);
  if (line.from !== to) return { from, to, prefs: null };
  const prefs = parseMermaidMetaLine(line.text);
  if (!prefs) return { from, to, prefs: null };
  const end = line.to < state.doc.length ? line.to + 1 : line.to;
  return { from, to: end, prefs };
}

function handleTable(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): boolean {
  const base = blockWidgetRange(state, node.from, node.to);
  const { from, to, layout } = extendTableRangeWithMeta(state, base.from, base.to);
  // 仅显式「源码编辑」时拆预览；单元格直编期间仍保持 Widget。
  if (isTableInSourceEdit(state, from, to) || isTableInSourceEdit(state, node.from, node.to)) {
    return false;
  }
  const rows = parseTableRows(state, node);
  if (rows.length === 0) return false;
  ranges.push(
    Decoration.replace({
      widget: new TableWidget(rows, from, to, layout, state.facet(resolveTableImageSrcFacet)),
      block: true,
    }).range(from, to),
  );
  return true;
}

function handleFencedCode(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): boolean {
  const info = node.node.getChild("CodeInfo");
  const text = node.node.getChild("CodeText");
  if (!info || !text) return false;
  const lang = state.doc.sliceString(info.from, info.to).trim().toLowerCase();
  if (lang !== "mermaid" && !lang.startsWith("mermaid ")) return false;

  const base = blockWidgetRange(state, node.from, node.to);
  const { from, to, prefs } = extendMermaidRangeWithMeta(state, base.from, base.to);
  // 与表格相同：仅「编辑」按钮触发的源码态才拆预览，不用光标碰触判断。
  if (isBlockInSourceEdit(state, from, to) || isBlockInSourceEdit(state, node.from, node.to)) {
    return false;
  }

  const source = state.doc.sliceString(text.from, text.to).replace(/\r\n/g, "\n").trim();
  if (!source) return false;
  // 围栏原文（不含 meta 注释），供缩放/字号写回时拼回
  const fenceText = state.doc.sliceString(base.from, base.to);
  ranges.push(
    Decoration.replace({
      widget: new MermaidWidget(source, from, to, prefs, fenceText),
      block: true,
    }).range(from, to),
  );
  return true;
}

function buildDecorations(view: EditorView, resolveImageSrc: ResolveImageSrc): DecorationSet {
  try {
    return buildDecorationsUnsafe(view, resolveImageSrc);
  } catch (err) {
    // 防止任何未预见的装饰冲突把整个编辑器渲染搞崩（表现为内容区一片空白）。
    // 降级为不加任何装饰，至少能看到原始 Markdown 文本。
    console.error("[markmfy] buildDecorations failed, falling back to plain text", err);
    return Decoration.none;
  }
}

function buildDecorationsUnsafe(view: EditorView, resolveImageSrc: ResolveImageSrc): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        switch (node.name) {
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6":
            handleHeading(node, state, ranges);
            break;
          case "StrongEmphasis":
            handleInlineMarks(node, state, ranges, "EmphasisMark", "mm-bold", false);
            break;
          case "Emphasis":
            handleInlineMarks(node, state, ranges, "EmphasisMark", "mm-italic", false);
            break;
          case "Strikethrough":
            handleInlineMarks(node, state, ranges, "StrikethroughMark", "mm-strikethrough", false);
            break;
          case "InlineCode":
            handleInlineMarks(node, state, ranges, "CodeMark", "mm-inline-code", false);
            break;
          case "QuoteMark":
            handleBlockquoteLine(node, state, ranges);
            break;
          case "Blockquote": {
            const fromLine = state.doc.lineAt(node.from).number;
            const toLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
            const firstQuoteMark = node.node.getChild("QuoteMark");
            if (
              !firstQuoteMark ||
              state.doc.sliceString(firstQuoteMark.to, firstQuoteMark.to + 1) !== " "
            ) {
              break;
            }
            for (let ln = fromLine; ln <= toLine; ln++) {
              ranges.push(
                Decoration.line({ class: "mm-blockquote" }).range(state.doc.line(ln).from),
              );
            }
            break;
          }
          case "ListMark":
            handleListMark(node, state, ranges);
            break;
          case "Task":
            ranges.push(
              Decoration.line({ class: "mm-task-line" }).range(state.doc.lineAt(node.from).from),
            );
            break;
          case "TaskMarker":
            handleTaskMarker(node, state, ranges);
            break;
          case "Link":
            handleLink(node, state, ranges);
            break;
          case "Image":
            if (handleImage(node, state, ranges, resolveImageSrc)) return false;
            break;
          case "InlineMath":
            if (handleInlineMath(node, state, ranges)) return false;
            break;
          // Table / Mermaid / 普通代码块 / BlockMath / HorizontalRule 的整块替换由 blockDecorationsField 负责。
          case "Table": {
            const { from, to } = blockWidgetRange(state, node.from, node.to);
            if (
              !isTableInSourceEdit(state, from, to) &&
              !isTableInSourceEdit(state, node.from, node.to)
            ) {
              return false;
            }
            break;
          }
          case "FencedCode": {
            const base = blockWidgetRange(state, node.from, node.to);
            if (isMermaidFence(state, node)) {
              const { from, to } = extendMermaidRangeWithMeta(state, base.from, base.to);
              if (
                !isBlockInSourceEdit(state, from, to) &&
                !isBlockInSourceEdit(state, node.from, node.to)
              ) {
                return false;
              }
            } else if (
              !isBlockInSourceEdit(state, base.from, base.to) &&
              !isBlockInSourceEdit(state, node.from, node.to)
            ) {
              return false;
            }
            break;
          }
          case "HorizontalRule": {
            const base = blockWidgetRange(state, node.from, node.to);
            if (
              !isBlockInSourceEdit(state, base.from, base.to) &&
              !isBlockInSourceEdit(state, node.from, node.to)
            ) {
              return false;
            }
            break;
          }
          case "BlockMath":
            if (!isCursorTouching(state, node.from, node.to)) return false;
            break;
          default:
            break;
        }
        return undefined;
      },
    });
    decorateControlledHtml(state, from, to, ranges);
  }

  return Decoration.set(ranges, true);
}

/**
 * 计算表格 / Mermaid 代码块 / 分割线这几个"整块替换"装饰。
 * 必须通过 StateField 提供给 EditorView.decorations，不能放进 ViewPlugin
 * （CM6 会在这种情况下抛出 "Block decorations may not be specified via plugins"）。
 * 因此这里不按 view.visibleRanges 裁剪，而是遍历整篇文档；
 * 对个人笔记级别的文档规模，这个开销可以忽略。
 */
/** 光标落在表格/Mermaid 源码块时加浅底提示，避免被当成“渲染失败”。 */
function markSourceEditing(
  state: EditorState,
  from: number,
  to: number,
  ranges: Range<Decoration>[],
): void {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to > from ? to - 1 : to));
  ranges.push(
    Decoration.line({ class: "mm-source-editing mm-source-editing-first" }).range(startLine.from),
  );
  for (let ln = startLine.number + 1; ln <= endLine.number; ln++) {
    ranges.push(Decoration.line({ class: "mm-source-editing" }).range(state.doc.line(ln).from));
  }
}

function isMermaidFence(state: EditorState, node: SyntaxNodeRef): boolean {
  const info = node.node.getChild("CodeInfo");
  if (!info) return false;
  const lang = state.doc.sliceString(info.from, info.to).trim().toLowerCase();
  return lang === "mermaid" || lang.startsWith("mermaid ");
}

/**
 * 裸围栏要等用户输入空格后才进入预览；已闭合围栏或带语言信息的围栏
 * 保持原有行为，避免打开已有 Markdown 文件时代码块退化为源码。
 */
function isFenceReadyForPreview(state: EditorState, node: SyntaxNodeRef): boolean {
  const marks = node.node.getChildren("CodeMark");
  if (marks.length >= 2 || node.node.getChild("CodeInfo")) return true;
  const openingMark = marks[0];
  if (!openingMark) return false;
  const line = state.doc.lineAt(node.from);
  const next = state.doc.sliceString(openingMark.to, Math.min(line.to, openingMark.to + 1));
  return next === " ";
}

/** 普通围栏 → 内嵌 CM Widget（编辑时不露 ```）；Mermaid 仍走 handleFencedCode。 */
function handlePlainCodeBlock(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): boolean {
  if (isMermaidFence(state, node)) return false;
  if (!isFenceReadyForPreview(state, node)) return false;
  const { from, to } = blockWidgetRange(state, node.from, node.to);
  if (isBlockInSourceEdit(state, from, to) || isBlockInSourceEdit(state, node.from, node.to)) {
    return false;
  }

  const info = node.node.getChild("CodeInfo");
  const text = node.node.getChild("CodeText");
  const fenceInfo = info ? parseFenceInfo(state.doc.sliceString(info.from, info.to)) : null;
  const lang = fenceInfo?.lang ?? "";
  const body = text ? normalizeCodeBody(state.doc.sliceString(text.from, text.to)) : "";

  ranges.push(
    Decoration.replace({
      widget: new CodeBlockWidget(lang, body, from, to, fenceInfo?.theme),
      block: true,
    }).range(from, to),
  );
  return true;
}

function buildBlockDecorations(state: EditorState): DecorationSet {
  try {
    const ranges: Range<Decoration>[] = [];
    syntaxTree(state).iterate({
      enter(node) {
        switch (node.name) {
          case "HorizontalRule":
            handleHorizontalRule(node, state, ranges);
            return false;
          case "BlockMath":
            handleBlockMath(node, state, ranges);
            return false;
          case "Table": {
            const range = blockWidgetRange(state, node.from, node.to);
            if (
              isTableInSourceEdit(state, range.from, range.to) ||
              isTableInSourceEdit(state, node.from, node.to)
            ) {
              markSourceEditing(state, node.from, node.to, ranges);
            } else {
              handleTable(node, state, ranges);
            }
            return false;
          }
          case "FencedCode":
            if (isMermaidFence(state, node)) {
              const base = blockWidgetRange(state, node.from, node.to);
              const range = extendMermaidRangeWithMeta(state, base.from, base.to);
              if (
                isBlockInSourceEdit(state, range.from, range.to) ||
                isBlockInSourceEdit(state, node.from, node.to)
              ) {
                markSourceEditing(state, node.from, node.to, ranges);
              } else {
                handleFencedCode(node, state, ranges);
              }
            } else {
              const range = blockWidgetRange(state, node.from, node.to);
              if (
                isBlockInSourceEdit(state, range.from, range.to) ||
                isBlockInSourceEdit(state, node.from, node.to)
              ) {
                markSourceEditing(state, node.from, node.to, ranges);
              } else {
                handlePlainCodeBlock(node, state, ranges);
              }
            }
            return false;
          default:
            return undefined;
        }
      },
    });
    return Decoration.set(ranges, true);
  } catch (err) {
    console.error("[markmfy] buildBlockDecorations failed, falling back to plain text", err);
    return Decoration.none;
  }
}

/**
 * 输入裸围栏后按空格时，一次性补成闭合代码块，并在后面留下真实空段落。
 * 块 Widget 若覆盖到文档末尾，外层就没有可点击的后续行；在输入阶段完成
 * 结构补全后，用户在代码框下方看到和点击到的就是普通 CodeMirror 行。
 */
const completeBareFenceOnSpace = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " " || from !== to) return false;
  const line = view.state.doc.lineAt(from);
  if (from !== line.to) return false;
  const match = line.text.match(/^(\s*)(`{3,})$/);
  if (!match) return false;

  const indent = match[1];
  const fence = match[2];
  if (indent == null || fence == null) return false;
  const insert = `${indent}${fence}\n${indent}\n${indent}${fence}\n\n`;
  // 光标落在闭合围栏后的真实空段落，而不是代码块内部。
  const afterBlockPos = line.from + insert.length - 1;
  const bodyPos = line.from + indent.length + fence.length + 1;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: { anchor: afterBlockPos },
    effects: requestCodeBlockBodyFocus.of(bodyPos),
    scrollIntoView: true,
  });
  return true;
});

/**
 * 光标位于代码块后的空白边界时，Backspace 删除整个围栏块。
 * 默认删除只会吞掉块后的换行，把选区映射进块内，随后 Widget 会拆成源码；
 * 这里把代码块及其与光标之间的空白作为一个整体删除。
 */
function deletePrecedingCodeBlockOnBackspace(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const pos = selection.from;
  const line = view.state.doc.lineAt(pos);
  if (pos !== line.from || line.text !== "") return false;

  let targetFrom = -1;
  let targetTo = -1;
  let cursorInsideCodeBlock = false;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      if (node.from <= pos && node.to >= pos) {
        cursorInsideCodeBlock = true;
      }
      if (node.to <= line.from) {
        targetFrom = node.from;
        targetTo = node.to;
      }
    },
  });
  if (cursorInsideCodeBlock || targetFrom < 0) return false;
  if (view.state.doc.sliceString(targetTo, pos).trim() !== "") return false;

  const from = view.state.doc.lineAt(targetFrom).from;
  view.dispatch({
    changes: { from, to: pos },
    selection: { anchor: from },
    scrollIntoView: true,
  });
  return true;
}

const codeBlockBoundaryKeymap = Prec.highest(
  keymap.of([
    {
      key: "Backspace",
      run: (view) => deletePrecedingCodeBlockOnBackspace(view),
    },
  ]),
);

/** 临时首行文字被删空后，撤掉代码块前的空段落，让代码块回到第一行。 */
const temporaryLeadingParagraphCleanup = EditorView.updateListener.of((update) => {
  if (!update.docChanged || !update.state.field(temporaryLeadingParagraphField, false)) {
    return;
  }
  const doc = update.state.doc;
  if (doc.length < 2 || doc.sliceString(0, 1) !== "\n" || doc.line(1).text !== "") return;
  queueMicrotask(() => {
    const view = update.view;
    if (!view.state.field(temporaryLeadingParagraphField, false)) return;
    const current = view.state.doc;
    if (current.length < 2 || current.sliceString(0, 1) !== "\n" || current.line(1).text !== "") {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: 1 },
      selection: { anchor: 0 },
      effects: markTemporaryLeadingParagraph.of(false),
    });
  });
});

function sourceEditRangeEqual(
  a: { from: number; to: number } | null | undefined,
  b: { from: number; to: number } | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.from === b.from && a.to === b.to;
}

function selectionNearBlockMath(state: EditorState): boolean {
  let found = false;
  for (const range of state.selection.ranges) {
    const from = Math.max(0, range.from - 1);
    const to = Math.min(state.doc.length, range.to + 1);
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === "BlockMath") {
          found = true;
          return false;
        }
        return undefined;
      },
    });
    if (found) return true;
  }
  return false;
}

const BLOCK_START_CHARACTER_RE = /[\n`~|$*_-]/;

/**
 * 普通正文输入不需要重建全文块级装饰。只有变更碰到已有块，或插入/删除了可能
 * 形成表格、围栏代码、分割线、块公式的字符时，才需要重新扫描全文语法树。
 */
function docChangeAffectsBlockDecorations(tr: Transaction, decorations: DecorationSet): boolean {
  let affected = false;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (affected) return;
    const removed = tr.startState.doc.sliceString(fromA, toA);
    const inserted = tr.newDoc.sliceString(fromB, toB);
    if (BLOCK_START_CHARACTER_RE.test(removed) || BLOCK_START_CHARACTER_RE.test(inserted)) {
      affected = true;
      return;
    }
    decorations.between(
      Math.max(0, fromA - 1),
      Math.min(tr.startState.doc.length, toA + 1),
      (from, to) => {
        if (from <= toA && to >= fromA) affected = true;
      },
    );
  });
  return affected;
}

const blockDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    // 短超时尽量解析首屏附近；超时不硬堵，靠 treeChanged 后续补齐 Widget
    ensureSyntaxTree(state, state.doc.length, 500);
    return buildBlockDecorations(state);
  },
  update(deco, tr) {
    const sourceModeToggled = tr.effects.some(
      (e) => e.is(requestBlockSourceEdit) || e.is(clearBlockSourceEdit),
    );
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    // 光标移出块时 field 自动清空，不走 effect，也要重建（取消源码态高亮）
    const prevSource = tr.startState.field(blockSourceEditField, false);
    const nextSource = tr.state.field(blockSourceEditField, false);
    const sourceModeChanged = !sourceEditRangeEqual(prevSource, nextSource);
    // BlockMath 靠光标进出切换预览/源码，需在相关选区变化时重建
    const mathSelectionChanged =
      !!tr.selection && (selectionNearBlockMath(tr.state) || selectionNearBlockMath(tr.startState));
    const docChangeAffectsBlocks = tr.docChanged && docChangeAffectsBlockDecorations(tr, deco);
    // 语法树在后台继续解析时也会更新；这类无文档变更的进度仍需补齐块装饰。
    const asyncTreeProgress = treeChanged && !tr.docChanged;

    if (
      docChangeAffectsBlocks ||
      asyncTreeProgress ||
      sourceModeToggled ||
      sourceModeChanged ||
      mathSelectionChanged
    ) {
      return buildBlockDecorations(tr.state);
    }
    // 纯 selection 变化不再全量扫树（表格/Mermaid 多时箭头键会卡）
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

async function handleLinkClick(view: EditorView, event: MouseEvent): Promise<void> {
  if (!event.ctrlKey && !event.metaKey) return;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return;

  let url: string | null = null;
  syntaxTree(view.state).iterate({
    from: pos,
    to: pos,
    enter(node) {
      if (node.name === "Link") {
        const urlNode = node.node.getChild("URL");
        if (urlNode) {
          url = view.state.doc.sliceString(urlNode.from, urlNode.to);
        }
      }
    },
  });
  if (!url) return;
  event.preventDefault();
  await openUrl(url);
}

/** 单击样式徽标（htmlPreview.ts 的 SpanBadgeWidget）选中整个 span 内容。 */
function handleStyleBadgeMouseDown(event: MouseEvent, view: EditorView): boolean {
  const target = event.target as HTMLElement | null;
  const badge = target?.closest?.(".mm-style-badge") as HTMLElement | null;
  if (!badge) return false;
  const from = Number(badge.dataset.spanFrom);
  const to = Number(badge.dataset.spanTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
  event.preventDefault();
  event.stopPropagation();
  view.dispatch({ selection: { anchor: from, head: to } });
  view.focus();
  return true;
}

/** Live preview: decoration ViewPlugin + link click + base theme. */
export function livePreviewExtension(resolveImageSrc: ResolveImageSrc): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, resolveImageSrc);
      }

      update(update: ViewUpdate): void {
        const treeChanged = syntaxTree(update.state) !== syntaxTree(update.startState);
        const sourceModeToggled = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(requestBlockSourceEdit) || e.is(clearBlockSourceEdit)),
        );
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          treeChanged ||
          sourceModeToggled
        ) {
          this.decorations = buildDecorations(update.view, resolveImageSrc);
        }
        // Widget ↔ 源码态行高变化大，不重测会导致下方标题点偏/点不到
        if (sourceModeToggled) {
          update.view.requestMeasure();
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );

  const clickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (handleStyleBadgeMouseDown(event, view)) return true;
      if (handleHeadingMouseDown(view, event)) return true;
      if (handleTextLineMouseDown(view, event)) return true;
      void handleLinkClick(view, event);
      return false;
    },
    dblclick(event, view) {
      if (handleHeadingDblClick(view, event)) return true;
      return handleInlineMarkDblClick(view, event);
    },
  });

  /** 预览态禁止光标停在隐藏的 `#` 上（打开文件默认落在 0 时尤其需要）。 */
  const headingSelectionClamp = EditorState.transactionFilter.of((tr) => {
    if (!tr.selection && !tr.docChanged) return tr;
    const state = tr.state;
    let needsClamp = false;
    const nextRanges = state.selection.ranges.map((r) => {
      const from = clampPosOutOfHeaderMark(state, r.from);
      const to = clampPosOutOfHeaderMark(state, r.to);
      if (from !== r.from || to !== r.to) needsClamp = true;
      return from === to ? EditorSelection.cursor(from) : EditorSelection.range(from, to);
    });
    if (!needsClamp) return tr;
    return [tr, { selection: EditorSelection.create(nextRanges) }];
  });

  /**
   * EditorState.create 的初始选区不走 transactionFilter，打开以 `# ` 开头的文件时
   * 光标会停在隐藏 HeaderMark 上（caret 透明），表现为“没法编辑”，
   * 直到双击标题触发一次带 selection 的 dispatch 才恢复。挂载后补夹一次。
   */
  const headingCaretBootstrap = ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        queueMicrotask(() => {
          if (!view.dom.isConnected) return;
          let needsClamp = false;
          const nextRanges = view.state.selection.ranges.map((r) => {
            const from = clampPosOutOfHeaderMark(view.state, r.from);
            const to = clampPosOutOfHeaderMark(view.state, r.to);
            if (from !== r.from || to !== r.to) needsClamp = true;
            return from === to ? EditorSelection.cursor(from) : EditorSelection.range(from, to);
          });
          if (!needsClamp) return;
          view.dispatch({
            selection: EditorSelection.create(nextRanges),
          });
        });
      }
    },
  );

  return [
    resolveTableImageSrcFacet.of(resolveImageSrc),
    tableSourceEditField,
    blockDecorationsField,
    codeBlockBodyFocusField,
    temporaryLeadingParagraphField,
    completeBareFenceOnSpace,
    codeBlockBoundaryKeymap,
    temporaryLeadingParagraphCleanup,
    plugin,
    clickHandler,
    headingSelectionClamp,
    headingCaretBootstrap,
    livePreviewTheme,
  ];
}

const livePreviewTheme = EditorView.baseTheme({
  /* 折叠所有被隐藏的 Markdown 语法标记（标题 #、**、`、>、[]() 等）但保留零宽 DOM 节点，
     避免 Decoration.replace({}) 那种“完全消失”的隐藏方式让 posAtCoords/moveVertically
     失去锚点、命中相邻行或整行被方向键跳过。见 hideRange() 注释。 */
  /* 不用 letter-spacing 折叠：该属性会继承，与 .mm-visual-style 等装饰嵌套后会打乱正文（尤其是中文）字距。
     font-size:0 + width:0 + overflow:hidden 已足够把语法标记压成零宽锚点。 */
  ".mm-hide-mark": {
    fontSize: "0",
    lineHeight: "0",
    letterSpacing: "normal",
    color: "transparent",
    caretColor: "transparent",
    display: "inline-block",
    width: "0",
    overflow: "hidden",
    verticalAlign: "baseline",
  },
  ".mm-h1": { fontSize: "1.75em", fontWeight: "650", lineHeight: "1.35", textDecoration: "none" },
  ".mm-h2": { fontSize: "1.375em", fontWeight: "620", lineHeight: "1.45", textDecoration: "none" },
  ".mm-h3": { fontSize: "1.125em", fontWeight: "600", lineHeight: "1.5", textDecoration: "none" },
  ".mm-h4": { fontSize: "1.05em", fontWeight: "600", lineHeight: "1.5", textDecoration: "none" },
  ".mm-h5": { fontSize: "1em", fontWeight: "600", lineHeight: "1.5", textDecoration: "none" },
  ".mm-h6": {
    fontSize: "0.95em",
    fontWeight: "600",
    color: "var(--mm-color-text-muted)",
    lineHeight: "1.5",
    textDecoration: "none",
  },
  ".mm-bold": { fontWeight: "700" },
  ".mm-italic": { fontStyle: "italic" },
  ".mm-strikethrough": { textDecoration: "line-through" },
  /* 行内代码预览 */
  ".mm-inline-code": {
    fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
    background: "var(--mm-color-bg-muted)",
    border: "1px solid var(--mm-color-border)",
    borderRadius: "var(--mm-radius-sm)",
    padding: "0 5px",
  },
  ".mm-html-u": { textDecoration: "underline" },
  ".mm-html-sup": { verticalAlign: "super", fontSize: "0.75em" },
  ".mm-html-sub": { verticalAlign: "sub", fontSize: "0.75em" },
  ".mm-html-span": {
    borderRadius: "2px",
    padding: "0 1px",
  },
  /* span 样式徽标：字号数字 / 颜色小色块；双击选中整个 span 内容 */
  ".mm-style-badge": {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    verticalAlign: "baseline",
    margin: "0 1px",
    padding: "0 3px",
    borderRadius: "3px",
    background: "var(--mm-color-bg-muted)",
    border: "1px solid var(--mm-color-border)",
    color: "var(--mm-color-text-muted)",
    fontSize: "0.72em",
    lineHeight: "1.1",
    cursor: "default",
    userSelect: "none",
  },
  ".mm-style-badge__swatch": {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "2px",
    border: "1px solid var(--mm-color-border)",
  },
  ".mm-html-align": { display: "block" },
  ".mm-math": {
    fontSize: "1em",
  },
  ".mm-math--inline": {
    display: "inline-block",
    verticalAlign: "middle",
    margin: "0 0.15em",
  },
  ".mm-math--block": {
    display: "block",
    margin: "12px 0",
    overflowX: "auto",
    textAlign: "center",
  },
  ".mm-math--error": {
    color: "var(--mm-color-danger, #b42318)",
    fontFamily: "var(--mm-font-mono, Consolas, monospace)",
    fontSize: "0.9em",
  },
  ".mm-fenced-code": {
    backgroundColor: "var(--mm-color-bg-muted)",
    fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
    fontSize: "0.92em",
    lineHeight: "1.55",
  },
  ".mm-fenced-code--first": {
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    paddingTop: "6px",
  },
  ".mm-fenced-code--last": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    paddingBottom: "6px",
  },
  ".mm-code-block": {
    position: "relative",
    margin: "14px 0",
    padding: "0",
    "--mm-code-bg": "#011627",
    "--mm-code-toolbar-bg": "#071e33",
    "--mm-code-border": "#1d3b53",
    "--mm-code-text": "#d6deeb",
    "--mm-code-muted": "#637777",
    "--mm-code-accent": "#82aaff",
    "--mm-code-hover": "rgba(130, 170, 255, 0.12)",
    "--mm-code-syntax-keyword": "#c792ea",
    "--mm-code-syntax-atom": "#f78c6c",
    "--mm-code-syntax-literal": "#82aaff",
    "--mm-code-syntax-string": "#ecc48d",
    "--mm-code-syntax-type": "#ffcb8b",
    "--mm-code-syntax-comment": "#637777",
    "--mm-code-syntax-meta": "#7fdbca",
    "--mm-code-syntax-invalid": "#ef5350",
    backgroundColor: "var(--mm-code-bg)",
    color: "var(--mm-code-text)",
    borderRadius: "8px",
    border: "1px solid var(--mm-code-border)",
    fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
  },
  '.mm-code-block[data-code-theme="one-dark-pro"]': {
    "--mm-code-bg": "#282c34",
    "--mm-code-toolbar-bg": "#21252b",
    "--mm-code-border": "#3e4451",
    "--mm-code-text": "#abb2bf",
    "--mm-code-muted": "#5c6370",
    "--mm-code-accent": "#61afef",
    "--mm-code-hover": "rgba(97, 175, 239, 0.12)",
    "--mm-code-syntax-keyword": "#c678dd",
    "--mm-code-syntax-atom": "#d19a66",
    "--mm-code-syntax-literal": "#56b6c2",
    "--mm-code-syntax-string": "#98c379",
    "--mm-code-syntax-type": "#e5c07b",
    "--mm-code-syntax-comment": "#5c6370",
    "--mm-code-syntax-meta": "#abb2bf",
    "--mm-code-syntax-invalid": "#e06c75",
  },
  '.mm-code-block[data-code-theme="darcula"]': {
    "--mm-code-bg": "#2b2b2b",
    "--mm-code-toolbar-bg": "#313335",
    "--mm-code-border": "#3c3f41",
    "--mm-code-text": "#a9b7c6",
    "--mm-code-muted": "#808080",
    "--mm-code-accent": "#4a88c7",
    "--mm-code-hover": "rgba(74, 136, 199, 0.16)",
    "--mm-code-syntax-keyword": "#cc7832",
    "--mm-code-syntax-atom": "#9876aa",
    "--mm-code-syntax-literal": "#6897bb",
    "--mm-code-syntax-string": "#6a8759",
    "--mm-code-syntax-type": "#a9b7c6",
    "--mm-code-syntax-comment": "#808080",
    "--mm-code-syntax-meta": "#bbb529",
    "--mm-code-syntax-invalid": "#ff6b68",
  },
  ".mm-code-block:focus-within": {
    borderColor: "var(--mm-code-accent)",
  },
  ".mm-code-block__above": {
    position: "absolute",
    left: "0",
    right: "0",
    top: "-30px",
    height: "28px",
    padding: "0",
    border: "0",
    outline: "none",
    background: "transparent",
    color: "var(--mm-color-text)",
    font: "inherit",
    opacity: "0",
    cursor: "text",
  },
  ".mm-code-block__above:focus": {
    opacity: "1",
  },
  ".mm-code-block > .mm-code-block__toolbar": {
    position: "static",
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: "6px",
    minHeight: "34px",
    margin: "0",
    padding: "3px 7px",
    borderBottom: "1px solid var(--mm-code-border)",
    borderTopLeftRadius: "7px",
    borderTopRightRadius: "7px",
    background: "var(--mm-code-toolbar-bg)",
    color: "var(--mm-code-text)",
    opacity: "1",
    pointerEvents: "auto",
  },
  ".mm-code-block__lang-menu": {
    marginLeft: "auto",
    flex: "0 0 auto",
  },
  ".mm-code-block__lang-menu .mm-widget-menu__trigger": {
    maxWidth: "160px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "13px",
    padding: "3px 5px",
  },
  ".mm-code-block__lang-menu .mm-widget-menu__list": {
    minWidth: "180px",
    maxHeight: "300px",
    overflowY: "auto",
  },
  ".mm-code-block__theme-menu .mm-widget-menu__trigger": {
    maxWidth: "136px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "13px",
    padding: "3px 5px",
  },
  ".mm-code-block__theme-menu .mm-widget-menu__list": {
    minWidth: "160px",
  },
  ".mm-code-block .mm-widget-btn": {
    padding: "3px 5px",
    border: "0",
    background: "transparent",
    boxShadow: "none",
    fontSize: "12px",
    color: "var(--mm-code-text)",
  },
  ".mm-code-block .mm-widget-btn:hover": {
    background: "var(--mm-code-hover)",
  },
  ".mm-code-block .mm-widget-menu__list": {
    background: "var(--mm-code-toolbar-bg)",
    borderColor: "var(--mm-code-border)",
  },
  ".mm-code-block .mm-widget-menu__item::before": {
    content: '" "',
    display: "inline-block",
    width: "16px",
  },
  ".mm-code-block .mm-widget-menu__item.is-active::before": {
    content: '"✓"',
    color: "var(--mm-code-accent)",
  },
  ".mm-code-block__editor": {
    minHeight: "1.5em",
  },
  ".mm-code-block__editor .cm-editor": {
    backgroundColor: "transparent",
  },
  ".mm-code-block__editor .cm-cursor": {
    borderLeftColor: "var(--mm-code-accent)",
  },
  ".mm-blockquote": {
    borderLeft: "2px solid var(--mm-color-border-strong, var(--mm-color-accent))",
    paddingLeft: "12px",
    color: "var(--mm-color-text-muted)",
    background: "var(--mm-color-accent-soft)",
  },
  ".mm-link": { color: "var(--mm-color-accent)", textDecoration: "none", cursor: "pointer" },
  ".mm-link:hover": { textDecoration: "underline" },
  ".mm-list-mark": { color: "var(--mm-color-text-muted)" },
  ".mm-bullet": { color: "var(--mm-color-text-muted)", marginRight: "2px" },
  ".mm-hr-wrap": {
    display: "block",
    padding: "0.45em 0",
    cursor: "text",
  },
  ".mm-hr": {
    border: "none",
    borderTop: "1px solid var(--mm-color-border)",
    margin: "0",
    padding: "0",
    display: "block",
    pointerEvents: "none",
  },
  ".mm-image-wrap": {
    position: "relative",
    display: "inline-block",
    maxWidth: "100%",
    margin: "14px 0",
  },
  ".mm-image": {
    maxWidth: "100%",
    maxHeight: "min(72vh, 900px)",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    borderRadius: "var(--mm-radius-md)",
    display: "block",
    boxShadow: "var(--mm-shadow-panel)",
  },
  ".mm-image--error": {
    padding: "8px 12px",
    color: "var(--mm-color-text-muted)",
    border: "1px dashed var(--mm-color-border)",
    borderRadius: "var(--mm-radius-sm)",
    fontSize: "12px",
  },
  ".mm-task-checkbox": { marginRight: "4px", verticalAlign: "middle" },
  ".mm-table-wrap": {
    position: "relative",
    margin: "14px 0",
    cursor: "default",
  },
  ".mm-table-frame": {
    position: "relative",
    /* 给边缘悬浮按钮留出可命中的空间，避免控件依赖 frame 外溢坐标 */
    paddingLeft: "14px",
    paddingTop: "14px",
  },
  ".mm-table-overlay": {
    position: "absolute",
    inset: "0",
    overflow: "visible",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.12s ease",
    zIndex: "5",
  },
  ".mm-table-wrap:hover .mm-table-overlay, .mm-table-wrap:focus-within .mm-table-overlay": {
    opacity: "1",
  },
  ".mm-table": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
    background: "var(--mm-color-surface)",
  },
  ".mm-table--fixed": {
    tableLayout: "fixed",
    width: "max-content",
    maxWidth: "100%",
  },
  ".mm-table th, .mm-table td, .mm-table-cell": {
    border: "1px solid var(--mm-color-border)",
    padding: "7px 10px",
    textAlign: "left",
    minWidth: "40px",
    outline: "none",
    verticalAlign: "middle",
    position: "relative",
    wordBreak: "break-word",
  },
  ".mm-table th": {
    background: "var(--mm-color-bg-muted)",
    fontWeight: "600",
  },
  ".mm-table-resizer": {
    position: "absolute",
    zIndex: "4",
    background: "transparent",
  },
  ".mm-table-resizer--col": {
    top: "0",
    right: "-3px",
    width: "6px",
    height: "100%",
    cursor: "col-resize",
  },
  ".mm-table-resizer--row": {
    left: "0",
    bottom: "-3px",
    width: "100%",
    height: "6px",
    cursor: "row-resize",
  },
  ".mm-table-resizer:hover, .mm-table-resizer:active": {
    background: "var(--mm-color-accent-soft)",
  },
  ".mm-table-handle": {
    position: "absolute",
    width: "16px",
    height: "16px",
    border: "1px solid var(--mm-color-border)",
    borderRadius: "50%",
    background: "var(--mm-color-surface)",
    color: "var(--mm-color-text-muted)",
    fontSize: "12px",
    lineHeight: "14px",
    padding: "0",
    cursor: "pointer",
    pointerEvents: "auto",
    zIndex: "6",
    boxShadow: "var(--mm-shadow-panel)",
  },
  ".mm-table-add:hover": {
    background: "var(--mm-color-success-soft)",
    borderColor: "var(--mm-color-success)",
    color: "var(--mm-color-success)",
  },
  ".mm-table-del:hover": {
    background: "var(--mm-color-danger-soft)",
    borderColor: "var(--mm-color-danger)",
    color: "var(--mm-color-danger)",
  },
  ".mm-table-cell__content": {
    minHeight: "1.2em",
    outline: "none",
  },
  ".mm-table-cell:hover": {
    background: "var(--mm-color-hover)",
  },
  ".mm-table-cell--editing": {
    background: "var(--mm-color-accent-soft)",
    boxShadow: "inset 0 0 0 1px var(--mm-color-accent)",
  },
  ".mm-table-cell--editing .mm-table-cell__content": {
    whiteSpace: "pre-wrap",
  },
  ".mm-table .mm-inline-code": {
    fontFamily: "var(--mm-font-mono, monospace)",
    background: "var(--mm-color-bg-muted)",
    borderRadius: "var(--mm-radius-sm)",
    padding: "0 4px",
  },
  ".mm-inline-image": {
    display: "inline-block",
    maxWidth: "100%",
    maxHeight: "160px",
    verticalAlign: "middle",
    borderRadius: "var(--mm-radius-sm)",
    margin: "2px 0",
  },
  ".mm-inline-link": {
    color: "var(--mm-color-accent)",
    textDecoration: "underline",
  },
  ".mm-mermaid": {
    position: "relative",
    margin: "16px 0",
    padding: "10px",
    background: "var(--mm-color-bg-muted)",
    border: "1px solid var(--mm-color-border)",
    borderRadius: "var(--mm-radius-md)",
    cursor: "grab",
    overflow: "hidden",
  },
  ".mm-mermaid__viewport": {
    position: "relative",
    width: "100%",
    // 高度由 JS 设为「适应后的图高」；stage 绝对定位，避免 SVG 原始高度撑开 CM widget
    overflow: "hidden",
    borderRadius: "var(--mm-radius-sm)",
    touchAction: "none",
    background: "var(--mm-color-surface)",
  },
  ".mm-mermaid__viewport--dragging": {
    cursor: "grabbing",
  },
  ".mm-mermaid__stage": {
    position: "absolute",
    left: "0",
    top: "0",
    transformOrigin: "0 0",
    willChange: "transform",
    lineHeight: "0",
  },
  ".mm-mermaid__canvas": {
    display: "block",
    lineHeight: "0",
  },
  ".mm-mermaid__canvas svg": {
    maxWidth: "none",
    display: "block",
  },
  ".mm-mermaid__status": {
    fontSize: "11px",
    color: "var(--mm-color-text-muted)",
    padding: "0 6px",
    alignSelf: "center",
    whiteSpace: "nowrap",
  },
  ".mm-mermaid--error": {
    color: "var(--mm-color-danger)",
    whiteSpace: "pre-wrap",
    fontSize: "12px",
    cursor: "text",
  },
  ".mm-widget-toolbar": {
    position: "absolute",
    top: "4px",
    right: "4px",
    maxWidth: "calc(100% - 8px)",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "4px",
    zIndex: "2",
    opacity: "0",
    // 不可见时不能拦截鼠标事件，否则会挡住下方拖拽/悬浮，
    // 且用户「点」到图上其实点在了这个隐形按钮上（Task086 复制按钮反馈的 bug）
    pointerEvents: "none",
    transition: "opacity 0.15s ease",
  },
  ".mm-table-wrap:hover .mm-widget-toolbar, .mm-mermaid:hover .mm-widget-toolbar, .mm-image-wrap:hover .mm-widget-toolbar, .mm-code-block:hover .mm-widget-toolbar, .mm-code-block:focus-within .mm-widget-toolbar":
    {
      opacity: "1",
      pointerEvents: "auto",
    },
  // 代码块工具栏默认就是半透明可见（非 0），必须始终可点，用更高特异性覆盖上面的 none
  ".mm-code-block .mm-code-block__toolbar": {
    pointerEvents: "auto",
  },
  ".mm-widget-btn": {
    border: "1px solid var(--mm-color-border)",
    background: "var(--mm-color-surface)",
    borderRadius: "var(--mm-radius-sm)",
    padding: "3px 8px",
    fontSize: "12px",
    color: "var(--mm-color-text)",
    cursor: "pointer",
    boxShadow: "var(--mm-shadow-panel)",
  },
  ".mm-widget-btn:hover": {
    background: "var(--mm-color-hover)",
  },
  ".mm-widget-menu": {
    position: "relative",
  },
  ".mm-widget-menu__list": {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: "0",
    zIndex: "5",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "132px",
    padding: "4px",
    background: "var(--mm-color-surface-elevated, var(--mm-color-surface))",
    border: "1px solid var(--mm-color-border)",
    borderRadius: "var(--mm-radius-sm)",
    boxShadow: "var(--mm-shadow-panel)",
    // 打开后即使鼠标离开图表主体（外层工具栏 opacity/pointer-events 复位），菜单本身仍要可点
    pointerEvents: "auto",
  },
  // JS 用 `menu.hidden = true` 关闭菜单：上面这条规则的 class 选择器特异性和浏览器
  // 默认的 `[hidden]{display:none}` 相同，作者样式会覆盖 UA 样式导致 display:flex
  // 一直生效——鼠标一靠近图表让外层工具栏 opacity 从 0 变 1 时，「关闭」的菜单就跟着露出来。
  // 用属性选择器叠加提高特异性，显式盖掉上面的 display:flex。
  ".mm-widget-menu__list[hidden]": {
    display: "none",
  },
  ".mm-widget-menu__item": {
    width: "100%",
    textAlign: "left",
  },
  ".mm-source-editing": {
    backgroundColor: "var(--mm-color-accent-soft)",
  },
  ".mm-source-editing-first": {
    boxShadow: "inset 3px 0 0 var(--mm-color-accent)",
    /* 允许提示条完整显示，避免被行盒裁切 */
    overflow: "visible",
  },
  ".mm-source-editing-first::before": {
    content: '"源码编辑中 · 点击其它区域恢复预览"',
    display: "block",
    boxSizing: "border-box",
    fontSize: "11px",
    lineHeight: "1.45",
    color: "var(--mm-color-accent)",
    background: "var(--mm-color-accent-soft)",
    borderBottom: "1px solid var(--mm-color-border)",
    /* 负边距会盖住下一行标题并抢走点击；改为行内留白 */
    padding: "6px 10px",
    margin: "0 0 6px 0",
    fontFamily: 'var(--mm-ui-font-family, "Segoe UI", system-ui, sans-serif)',
    /* 提示条不参与命中，避免挡到下方「主流 Agent…」等标题 */
    pointerEvents: "none",
    userSelect: "none",
  },
});
