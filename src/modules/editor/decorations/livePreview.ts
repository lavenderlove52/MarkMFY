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
 * - Block-level "replace this whole node with a widget" decorations (Table, Mermaid fenced
 *   code, HorizontalRule) are computed by a `StateField` over the full document, recomputed
 *   on doc/tree/source-edit changes（纯 selection 移动不再全量 rebuild）.
 *
 * When the cursor is on a node, raw markdown syntax is shown; otherwise markers are hidden
 * and content is styled.
 *
 * Node names verified against @lezer/markdown with GFM extensions.
 */
import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
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
  TableWidget,
  type TableCellData,
} from "./widgets";
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

function hideRange(ranges: Range<Decoration>[], from: number, to: number): void {
  if (to > from) {
    ranges.push(Decoration.replace({}).range(from, to));
  }
}

function markRange(ranges: Range<Decoration>[], from: number, to: number, className: string): void {
  if (to > from) {
    ranges.push(Decoration.mark({ class: className }).range(from, to));
  }
}

function handleHeading(
  node: SyntaxNodeRef,
  state: EditorState,
  ranges: Range<Decoration>[],
): void {
  const level = HEADING_NAMES.indexOf(node.name) + 1;
  const line = state.doc.lineAt(node.from);
  const active = isCursorOnLine(state, node.from);

  if (active) return;

  ranges.push(Decoration.line({ class: `mm-h${level}` }).range(line.from));

  const headerMark = node.node.getChild("HeaderMark");
  if (headerMark) {
    const hasSpaceAfter = state.doc.sliceString(headerMark.to, headerMark.to + 1) === " ";
    hideRange(ranges, headerMark.from, headerMark.to + (hasSpaceAfter ? 1 : 0));
  }
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
  const active = isCursorOnLine(state, node.from);
  if (active) return;
  const { from, to } = blockWidgetRange(state, node.from, node.to);
  ranges.push(Decoration.replace({ widget: new HrWidget(), block: true }).range(from, to));
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
          // Table / Mermaid / HorizontalRule 的整块替换由 blockDecorationsField 负责。
          case "Table": {
            const { from, to } = blockWidgetRange(state, node.from, node.to);
            if (!isTableInSourceEdit(state, from, to) && !isTableInSourceEdit(state, node.from, node.to)) {
              return false;
            }
            break;
          }
          case "FencedCode": {
            if (isMermaidFence(state, node)) {
              const base = blockWidgetRange(state, node.from, node.to);
              const { from, to } = extendMermaidRangeWithMeta(state, base.from, base.to);
              if (!isBlockInSourceEdit(state, from, to) && !isBlockInSourceEdit(state, node.from, node.to)) {
                return false;
              }
            }
            break;
          }
          case "HorizontalRule":
            if (!isCursorOnLine(state, node.from)) return false;
            break;
          default:
            break;
        }
        return undefined;
      },
    });
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

function buildBlockDecorations(state: EditorState): DecorationSet {
  try {
    const ranges: Range<Decoration>[] = [];
    syntaxTree(state).iterate({
      enter(node) {
        switch (node.name) {
          case "HorizontalRule":
            handleHorizontalRule(node, state, ranges);
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

    if (tr.docChanged || sourceModeToggled || treeChanged || sourceModeChanged) {
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
        if (update.docChanged || update.selectionSet || update.viewportChanged || treeChanged) {
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
      void handleLinkClick(view, event);
    },
  });

  return [tableSourceEditField, blockDecorationsField, plugin, clickHandler, livePreviewTheme];
}

const livePreviewTheme = EditorView.baseTheme({
  ".mm-h1": { fontSize: "1.8em", fontWeight: "700", lineHeight: "1.4", textDecoration: "none" },
  ".mm-h2": { fontSize: "1.5em", fontWeight: "700", lineHeight: "1.4", textDecoration: "none" },
  ".mm-h3": { fontSize: "1.3em", fontWeight: "700", lineHeight: "1.4", textDecoration: "none" },
  ".mm-h4": { fontSize: "1.15em", fontWeight: "600", lineHeight: "1.4", textDecoration: "none" },
  ".mm-h5": { fontSize: "1.05em", fontWeight: "600", lineHeight: "1.4", textDecoration: "none" },
  ".mm-h6": {
    fontSize: "1em",
    fontWeight: "600",
    color: "#666",
    lineHeight: "1.4",
    textDecoration: "none",
  },
  ".mm-bold": { fontWeight: "700" },
  ".mm-italic": { fontStyle: "italic" },
  ".mm-strikethrough": { textDecoration: "line-through" },
  ".mm-inline-code": {
    fontFamily: "var(--mm-font-mono, monospace)",
    background: "rgba(0,0,0,0.06)",
    borderRadius: "3px",
    padding: "0 4px",
  },
  ".mm-blockquote": {
    borderLeft: "3px solid #c9c9c9",
    paddingLeft: "10px",
    color: "#666",
  },
  ".mm-link": { color: "#396cd8", textDecoration: "underline", cursor: "pointer" },
  ".mm-list-mark": { color: "#888" },
  ".mm-bullet": { color: "#888", marginRight: "2px" },
  ".mm-hr": {
    border: "none",
    borderTop: "1px solid #d0d0d0",
    margin: "1.25em 0",
    display: "block",
  },
  ".mm-image-wrap": {
    position: "relative",
    display: "inline-block",
    maxWidth: "100%",
    margin: "8px 0",
  },
  ".mm-image": { maxWidth: "100%", borderRadius: "4px", display: "block" },
  ".mm-image--error": {
    padding: "8px 12px",
    color: "#888",
    border: "1px dashed #ccc",
    borderRadius: "4px",
    fontSize: "12px",
  },
  ".mm-task-checkbox": { marginRight: "4px", verticalAlign: "middle" },
  ".mm-table-wrap": {
    position: "relative",
    margin: "8px 0",
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
  },
  ".mm-table--fixed": {
    tableLayout: "fixed",
    width: "max-content",
    maxWidth: "100%",
  },
  ".mm-table th, .mm-table td, .mm-table-cell": {
    border: "1px solid #d0d0d0",
    padding: "6px 10px",
    textAlign: "left",
    minWidth: "40px",
    outline: "none",
    verticalAlign: "middle",
    position: "relative",
    wordBreak: "break-word",
  },
  ".mm-table th": {
    background: "rgba(0,0,0,0.04)",
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
    background: "rgba(57, 108, 216, 0.35)",
  },
  ".mm-table-handle": {
    position: "absolute",
    width: "16px",
    height: "16px",
    border: "1px solid #c9c9c9",
    borderRadius: "50%",
    background: "#fff",
    color: "#555",
    fontSize: "12px",
    lineHeight: "14px",
    padding: "0",
    cursor: "pointer",
    pointerEvents: "auto",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  },
  ".mm-table-add:hover": {
    background: "#e8f5e9",
    borderColor: "#81c784",
    color: "#2e7d32",
  },
  ".mm-table-del:hover": {
    background: "#ffebee",
    borderColor: "#e57373",
    color: "#c62828",
  },
  ".mm-table-cell__content": {
    minHeight: "1.2em",
    outline: "none",
  },
  ".mm-table-cell:hover": {
    background: "rgba(57, 108, 216, 0.04)",
  },
  ".mm-table-cell--editing": {
    background: "#fffbeb",
    boxShadow: "inset 0 0 0 1px #e0a800",
  },
  ".mm-table-cell--editing .mm-table-cell__content": {
    whiteSpace: "pre-wrap",
  },
  ".mm-table .mm-inline-code": {
    fontFamily: "var(--mm-font-mono, monospace)",
    background: "rgba(0,0,0,0.06)",
    borderRadius: "3px",
    padding: "0 4px",
  },
  ".mm-mermaid": {
    position: "relative",
    margin: "12px 0",
    padding: "8px",
    background: "rgba(0,0,0,0.02)",
    borderRadius: "6px",
    cursor: "grab",
    overflow: "hidden",
  },
  ".mm-mermaid__viewport": {
    position: "relative",
    width: "100%",
    // 高度由 JS 设为「适应后的图高」；stage 绝对定位，避免 SVG 原始高度撑开 CM widget
    overflow: "hidden",
    borderRadius: "4px",
    touchAction: "none",
    background: "#fff",
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
    color: "#666",
    padding: "0 6px",
    alignSelf: "center",
    whiteSpace: "nowrap",
  },
  ".mm-mermaid--error": {
    color: "#cf222e",
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
  ".mm-table-wrap:hover .mm-widget-toolbar, .mm-mermaid:hover .mm-widget-toolbar, .mm-image-wrap:hover .mm-widget-toolbar":
    {
      opacity: "1",
    },
  ".mm-widget-btn": {
    border: "1px solid #c9c9c9",
    background: "#fff",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "12px",
    color: "#333",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  },
  ".mm-widget-btn:hover": {
    background: "#f5f5f5",
  },
  ".mm-source-editing": {
    backgroundColor: "rgba(255, 243, 205, 0.45)",
  },
  ".mm-source-editing-first": {
    boxShadow: "inset 3px 0 0 #e0a800",
  },
  ".mm-source-editing-first::before": {
    content: '"源码编辑中 · 点击其它区域恢复预览"',
    display: "block",
    fontSize: "11px",
    color: "#664d03",
    background: "#fff3cd",
    borderBottom: "1px solid #ffe69c",
    padding: "2px 8px",
    margin: "0 -24px 4px",
    fontFamily:
      '"Segoe UI", system-ui, -apple-system, sans-serif',
  },
});
