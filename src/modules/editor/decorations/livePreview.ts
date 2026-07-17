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
  StateField,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
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
import { normalizeCodeBody, normalizeFenceLang } from "./codeBlockModel";
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
function blockWidgetRange(state: EditorState, from: number, to: number): { from: number; to: number } {
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

function markRange(ranges: Range<Decoration>[], from: number, to: number, className: string): void {
  if (to > from) {
    ranges.push(Decoration.mark({ class: className }).range(from, to));
  }
}

function isPreviewWidgetTarget(target: Element): boolean {
  return !!target.closest(
    "button, a, input, textarea, select, .mm-table-wrap, .mm-mermaid, .mm-image-wrap, .mm-code-block, .mm-math",
  );
}

function caretPositionFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => { startContainer: Node; startOffset: number } | null;
  };

  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };

  const range = doc.caretRangeFromPoint?.(x, y);
  if (range) return { node: range.startContainer, offset: range.startOffset };

  return null;
}

function posFromDomPoint(view: EditorView, lineEl: Element, event: MouseEvent): number | null {
  const caret = caretPositionFromPoint(event.clientX, event.clientY);
  if (caret && lineEl.contains(caret.node)) {
    try {
      return view.posAtDOM(caret.node, caret.offset);
    } catch {
      return null;
    }
  }

  try {
    const lineStart = view.posAtDOM(lineEl, 0);
    return view.state.doc.lineAt(lineStart).to;
  } catch {
    return null;
  }
}

/**
 * 普通文本行点击修正：当上方块级 Widget 高度缓存短暂过期时，CM6 的
 * `posAtCoords` 可能把鼠标所在段落映射到下面的代码块/表格源码位置。
 * 这里用实际命中的 `.cm-line` DOM 做校验，只在坐标映射落到其它行时接管。
 *
 * 必须在 mousedown 里 preventDefault 并立刻改选区，否则光标会先落到错误行；
 * 同时挂上临时 mousemove，保证仍可从正确落点拖拽选区。
 */
function extendSelectionFromDom(
  view: EditorView,
  startAnchor: number,
  event: MouseEvent,
): void {
  const el = document.elementFromPoint(event.clientX, event.clientY);
  let head: number | null = null;
  if (el instanceof Element) {
    const lineEl = el.closest(".cm-line");
    if (lineEl && view.contentDOM.contains(lineEl) && !isPreviewWidgetTarget(el)) {
      head = posFromDomPoint(view, lineEl, event);
    }
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

/** 标题正文起点（跳过 `#` 与紧随空格）；非标题行返回 null。 */
function headingContentStart(state: EditorState, lineFrom: number, lineTo: number): number | null {
  let contentStart: number | null = null;
  syntaxTree(state).iterate({
    from: lineFrom,
    to: lineTo,
    enter(node) {
      if (!HEADING_NAMES.includes(node.name)) return;
      const headerMark = node.node.getChild("HeaderMark");
      if (headerMark) {
        const hasSpaceAfter = state.doc.sliceString(headerMark.to, headerMark.to + 1) === " ";
        contentStart = headerMark.to + (hasSpaceAfter ? 1 : 0);
      } else {
        contentStart = node.from;
      }
      return false;
    },
  });
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

function handleHeading(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const level = HEADING_NAMES.indexOf(node.name) + 1;
  const line = state.doc.lineAt(node.from);

  // 仅双击进入的源码态才露出 `#`；光标在标题行仍保持预览样式
  if (isHeadingLineInSourceEdit(state, line.from)) return;

  ranges.push(Decoration.line({ class: `mm-h${level}` }).range(line.from));

  const headerMark = node.node.getChild("HeaderMark");
  if (headerMark) {
    const hasSpaceAfter = state.doc.sliceString(headerMark.to, headerMark.to + 1) === " ";
    hideRange(ranges, headerMark.from, headerMark.to + (hasSpaceAfter ? 1 : 0));
  }
}

/** 双击标题行 → 进入 Markdown 源码编辑态（显示 `#`）。 */
function handleHeadingDblClick(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element) || isPreviewWidgetTarget(target)) return false;

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return false;
  const line = view.state.doc.lineAt(pos);
  const contentStart = headingContentStart(view.state, line.from, line.to);
  if (contentStart == null) return false;

  const { from, to } = headingLineRange(view.state, line.from);
  if (isBlockInSourceEdit(view.state, from, to)) return false;

  event.preventDefault();
  view.dispatch({
    effects: requestBlockSourceEdit.of({ from, to }),
    selection: { anchor: Math.max(line.from, Math.min(pos, line.to)) },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** 标题行鼠标命中修正：字号放大后点击常落到邻行，键盘却能进来。 */
function handleHeadingMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (isPreviewWidgetTarget(target)) return false;

  const headingSelector = ".cm-line.mm-h1, .cm-line.mm-h2, .cm-line.mm-h3, .cm-line.mm-h4, .cm-line.mm-h5, .cm-line.mm-h6";
  let lineEl: Element | null = target.closest(headingSelector);
  if (!lineEl) {
    for (const el of view.contentDOM.querySelectorAll(headingSelector)) {
      const rect = el.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        lineEl = el;
        break;
      }
    }
  }
  if (!lineEl) return false;

  let linePos: number;
  try {
    linePos = view.posAtDOM(lineEl, 0);
  } catch {
    return false;
  }
  const line = view.state.doc.lineAt(linePos);

  const midY = (lineEl.getBoundingClientRect().top + lineEl.getBoundingClientRect().bottom) / 2;
  let clickPos = view.posAtCoords({ x: event.clientX, y: midY });
  if (clickPos == null || clickPos < line.from || clickPos > line.to) {
    clickPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  }

  const contentStart = headingContentStart(view.state, line.from, line.to) ?? line.from;

  const mappedOk = clickPos != null && clickPos >= line.from && clickPos <= line.to;
  const alreadyOnLine =
    mappedOk &&
    view.state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from);

  // 已点在标题行正文上且选区已正确时交给 CM 默认行为
  if (mappedOk && alreadyOnLine && clickPos! >= contentStart) {
    return false;
  }

  const anchor = mappedOk ? Math.max(clickPos!, contentStart) : contentStart;
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
): void {
  const active = isCursorTouching(state, node.from, node.to);
  if (active) return;

  const marks = node.node.getChildren(markName);
  if (marks.length < 2) return;
  const open = marks[0];
  const close = marks[marks.length - 1];

  hideRange(ranges, open.from, open.to);
  hideRange(ranges, close.from, close.to);
  markRange(ranges, open.to, close.from, contentClass);
}

function handleBlockquoteLine(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const active = isCursorOnLine(state, node.from);
  if (active) return;
  const hasSpaceAfter = state.doc.sliceString(node.to, node.to + 1) === " ";
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

function handleListMark(node: SyntaxNodeRef, state: EditorState, ranges: Range<Decoration>[]): void {
  const text = state.doc.sliceString(node.from, node.to).trim();
  const active = isCursorTouching(state, node.from, node.to);
  if (active) return;
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

function parseTableRows(state: EditorState, tableNode: SyntaxNodeRef): TableCellData[][] {
  const rows: TableCellData[][] = [];
  for (let child = tableNode.node.firstChild; child; child = child.nextSibling) {
    if (child.name !== "TableHeader" && child.name !== "TableRow") continue;
    const isHeader = child.name === "TableHeader";
    const cells: TableCellData[] = [];
    for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name !== "TableCell") continue;
      cells.push({
        text: state.doc.sliceString(cell.from, cell.to).trim(),
        isHeader,
      });
    }
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

function handleTable(node: SyntaxNodeRef, state: EditorState, ranges: Range<Decoration>[]): boolean {
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
      widget: new TableWidget(rows, from, to, layout),
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
            handleInlineMarks(node, state, ranges, "EmphasisMark", "mm-bold");
            break;
          case "Emphasis":
            handleInlineMarks(node, state, ranges, "EmphasisMark", "mm-italic");
            break;
          case "Strikethrough":
            handleInlineMarks(node, state, ranges, "StrikethroughMark", "mm-strikethrough");
            break;
          case "InlineCode":
            handleInlineMarks(node, state, ranges, "CodeMark", "mm-inline-code");
            break;
          case "QuoteMark":
            handleBlockquoteLine(node, state, ranges);
            break;
          case "Blockquote": {
            const fromLine = state.doc.lineAt(node.from).number;
            const toLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
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
            if (!isTableInSourceEdit(state, from, to) && !isTableInSourceEdit(state, node.from, node.to)) {
              return false;
            }
            break;
          }
          case "FencedCode": {
            const base = blockWidgetRange(state, node.from, node.to);
            if (isMermaidFence(state, node)) {
              const { from, to } = extendMermaidRangeWithMeta(state, base.from, base.to);
              if (!isBlockInSourceEdit(state, from, to) && !isBlockInSourceEdit(state, node.from, node.to)) {
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
function markSourceEditing(state: EditorState, from: number, to: number, ranges: Range<Decoration>[]): void {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to > from ? to - 1 : to));
  ranges.push(Decoration.line({ class: "mm-source-editing mm-source-editing-first" }).range(startLine.from));
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

/** 普通围栏 → 内嵌 CM Widget（编辑时不露 ```）；Mermaid 仍走 handleFencedCode。 */
function handlePlainCodeBlock(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): boolean {
  if (isMermaidFence(state, node)) return false;
  const { from, to } = blockWidgetRange(state, node.from, node.to);
  if (isBlockInSourceEdit(state, from, to) || isBlockInSourceEdit(state, node.from, node.to)) {
    return false;
  }

  const info = node.node.getChild("CodeInfo");
  const text = node.node.getChild("CodeText");
  const lang = info ? normalizeFenceLang(state.doc.sliceString(info.from, info.to)) : "";
  const body = text ? normalizeCodeBody(state.doc.sliceString(text.from, text.to)) : "";

  ranges.push(
    Decoration.replace({
      widget: new CodeBlockWidget(lang, body, from, to),
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
      !!tr.selection &&
      (selectionNearBlockMath(tr.state) || selectionNearBlockMath(tr.startState));

    if (tr.docChanged || sourceModeToggled || treeChanged || sourceModeChanged || mathSelectionChanged) {
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
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );

  const clickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (handleHeadingMouseDown(view, event)) return true;
      if (handleTextLineMouseDown(view, event)) return true;
      void handleLinkClick(view, event);
      return false;
    },
    dblclick(event, view) {
      return handleHeadingDblClick(view, event);
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
    tableSourceEditField,
    blockDecorationsField,
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
  ".mm-h1": { fontSize: "1.95em", fontWeight: "720", lineHeight: "1.35", textDecoration: "none" },
  ".mm-h2": { fontSize: "1.55em", fontWeight: "700", lineHeight: "1.38", textDecoration: "none" },
  ".mm-h3": { fontSize: "1.28em", fontWeight: "680", lineHeight: "1.42", textDecoration: "none" },
  ".mm-h4": { fontSize: "1.14em", fontWeight: "650", lineHeight: "1.45", textDecoration: "none" },
  ".mm-h5": { fontSize: "1.04em", fontWeight: "620", lineHeight: "1.45", textDecoration: "none" },
  ".mm-h6": {
    fontSize: "1em",
    fontWeight: "600",
    color: "var(--mm-color-text-muted)",
    lineHeight: "1.45",
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
    padding: "10px 12px 8px",
    backgroundColor: "var(--mm-color-bg-muted)",
    borderRadius: "var(--mm-radius-md)",
    border: "1px solid var(--mm-color-border)",
    fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
  },
  ".mm-code-block__toolbar": {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "4px",
    opacity: "0.75",
  },
  ".mm-code-block:hover .mm-code-block__toolbar, .mm-code-block:focus-within .mm-code-block__toolbar": {
    opacity: "1",
  },
  ".mm-code-block__lang": {
    fontSize: "12px",
    padding: "3px 7px",
    borderRadius: "var(--mm-radius-sm)",
    border: "1px solid var(--mm-color-border)",
    background: "var(--mm-color-surface)",
    color: "var(--mm-color-text)",
    maxWidth: "140px",
  },
  ".mm-code-block__editor": {
    minHeight: "1.5em",
  },
  ".mm-code-block__editor .cm-editor": {
    backgroundColor: "transparent",
  },
  ".mm-blockquote": {
    borderLeft: "3px solid var(--mm-color-accent)",
    paddingLeft: "12px",
    color: "var(--mm-color-text-muted)",
    background: "linear-gradient(90deg, var(--mm-color-accent-soft), transparent 72%)",
  },
  ".mm-link": { color: "var(--mm-color-accent)", textDecoration: "underline", cursor: "pointer" },
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
    /* 给边缘悬浮按钮留一点点外溢空间，不占表格单元格 */
    marginLeft: "14px",
    marginTop: "14px",
  },
  ".mm-table-overlay": {
    position: "absolute",
    inset: "0",
    overflow: "visible",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.12s ease",
    zIndex: "3",
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
    display: "flex",
    gap: "4px",
    zIndex: "2",
    opacity: "0",
    transition: "opacity 0.15s ease",
  },
  ".mm-table-wrap:hover .mm-widget-toolbar, .mm-mermaid:hover .mm-widget-toolbar, .mm-image-wrap:hover .mm-widget-toolbar, .mm-code-block:hover .mm-widget-toolbar, .mm-code-block:focus-within .mm-widget-toolbar":
    {
      opacity: "1",
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
  ".mm-source-editing": {
    backgroundColor: "var(--mm-color-accent-soft)",
  },
  ".mm-source-editing-first": {
    boxShadow: "inset 3px 0 0 var(--mm-color-accent)",
  },
  ".mm-source-editing-first::before": {
    content: '"源码编辑中 · 点击其它区域恢复预览"',
    display: "block",
    fontSize: "11px",
    color: "var(--mm-color-accent)",
    background: "var(--mm-color-accent-soft)",
    borderBottom: "1px solid var(--mm-color-border)",
    padding: "2px 8px",
    margin: "0 -24px 4px",
    fontFamily:
      '"Segoe UI", system-ui, -apple-system, sans-serif',
  },
});
