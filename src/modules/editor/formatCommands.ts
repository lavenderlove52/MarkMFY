/**
 * 格式命令：对 EditorView 选区/当前行应用 Markdown 或受控 HTML 标记。
 */
import type { EditorView } from "@codemirror/view";
import { ChangeSet, EditorSelection } from "@codemirror/state";
import { applyVisualStyle } from "./decorations/styleMarks";

export type FormatAlign = "left" | "center" | "right" | "justify";

export type FormatCommand =
  | { type: "italic" }
  | { type: "strikethrough" }
  | { type: "inlineCode" }
  | { type: "underline" }
  | { type: "superscript" }
  | { type: "subscript" }
  | { type: "heading"; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "unorderedList" }
  | { type: "orderedList" }
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "fontSize"; size: string }
  | { type: "fontColor"; color: string }
  | { type: "backgroundColor"; color: string }
  | { type: "align"; align: FormatAlign }
  | { type: "lineHeight"; value: string };

export interface FormatCommandResult {
  ok: boolean;
}

const INDENT = "  ";

function focusAfter(view: EditorView): void {
  view.focus();
}

/** toggle 成对包裹：已包裹则去掉，否则加上；空选区插入成对标记并把光标放中间。 */
function toggleWrap(view: EditorView, open: string, close: string = open): FormatCommandResult {
  const { state } = view;
  const sel = state.selection.main;
  const from = sel.from;
  const to = sel.to;
  const doc = state.doc;
  const openLen = open.length;
  const closeLen = close.length;

  if (from === to) {
    const before = doc.sliceString(Math.max(0, from - openLen), from);
    const after = doc.sliceString(to, Math.min(doc.length, to + closeLen));
    if (before === open && after === close) {
      view.dispatch({
        changes: [
          { from: from - openLen, to: from, insert: "" },
          { from: to, to: to + closeLen, insert: "" },
        ],
        selection: { anchor: from - openLen },
      });
    } else {
      view.dispatch({
        changes: { from, insert: open + close },
        selection: { anchor: from + openLen },
      });
    }
    focusAfter(view);
    return { ok: true };
  }

  const selected = doc.sliceString(from, to);
  const wrapped =
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= openLen + closeLen;
  const outerWrapped =
    from >= openLen &&
    to + closeLen <= doc.length &&
    doc.sliceString(from - openLen, from) === open &&
    doc.sliceString(to, to + closeLen) === close;

  if (wrapped) {
    const inner = selected.slice(openLen, selected.length - closeLen);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    });
  } else if (outerWrapped) {
    view.dispatch({
      changes: [
        { from: from - openLen, to: from, insert: "" },
        { from: to, to: to + closeLen, insert: "" },
      ],
      selection: { anchor: from - openLen, head: to - openLen },
    });
  } else {
    view.dispatch({
      changes: { from, to, insert: open + selected + close },
      selection: { anchor: from + openLen, head: from + openLen + selected.length },
    });
  }
  focusAfter(view);
  return { ok: true };
}

function lineRangeForSelection(view: EditorView): { from: number; to: number } {
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from);
  const endLine = view.state.doc.lineAt(sel.to === sel.from ? sel.from : Math.max(sel.from, sel.to - 1));
  return { from: startLine.number, to: endLine.number };
}

const ATX_RE = /^(#{1,6})\s+/;
const UL_RE = /^(\s*)([-*+])\s+/;
const OL_RE = /^(\s*)(\d+)\.\s+/;
const TASK_RE = /^(\s*)([-*+])\s+\[[ xX]\]\s+/;

function setHeadingLevel(view: EditorView, level: 0 | 1 | 2 | 3 | 4 | 5 | 6): FormatCommandResult {
  const { from: startNum, to: endNum } = lineRangeForSelection(view);
  const changes: { from: number; to: number; insert: string }[] = [];
  const firstLine = view.state.doc.line(startNum);
  const firstBody = firstLine.text.replace(ATX_RE, "");
  const prefix = level === 0 ? "" : `${"#".repeat(level)} `;
  const cursorInFirst = firstLine.from + prefix.length;

  for (let n = startNum; n <= endNum; n++) {
    const line = view.state.doc.line(n);
    const text = line.text.replace(ATX_RE, "");
    const linePrefix = level === 0 ? "" : `${"#".repeat(level)} `;
    changes.push({ from: line.from, to: line.to, insert: linePrefix + text });
  }

  const changeSet = ChangeSet.of(changes, view.state.doc.length);
  const mappedCursor = changeSet.mapPos(cursorInFirst, 1);
  view.dispatch({
    changes: changeSet,
    selection: EditorSelection.cursor(Math.min(mappedCursor, changeSet.mapPos(firstLine.from + prefix.length + firstBody.length, 1))),
  });
  focusAfter(view);
  return { ok: true };
}

function toggleList(view: EditorView, ordered: boolean): FormatCommandResult {
  const { from: startNum, to: endNum } = lineRangeForSelection(view);
  const changes: { from: number; to: number; insert: string }[] = [];
  let order = 1;

  // 若选区全是目标列表则去掉，否则转成目标列表
  let allTarget = true;
  for (let n = startNum; n <= endNum; n++) {
    const text = view.state.doc.line(n).text;
    if (ordered) {
      if (!OL_RE.test(text)) allTarget = false;
    } else if (!UL_RE.test(text) || TASK_RE.test(text)) {
      if (!UL_RE.test(text)) allTarget = false;
    }
  }

  for (let n = startNum; n <= endNum; n++) {
    const line = view.state.doc.line(n);
    let text = line.text;
    const indentMatch = text.match(/^(\s*)/);
    const indent = indentMatch?.[1] ?? "";

    text = text.replace(TASK_RE, "$1");
    text = text.replace(UL_RE, "$1");
    text = text.replace(OL_RE, "$1");
    text = text.replace(ATX_RE, "");

    if (allTarget) {
      changes.push({ from: line.from, to: line.to, insert: text });
    } else {
      const marker = ordered ? `${order}. ` : "- ";
      order += 1;
      // text 可能仍带原缩进
      const body = text.replace(/^\s*/, "");
      changes.push({ from: line.from, to: line.to, insert: indent + marker + body });
    }
  }

  view.dispatch({ changes: ChangeSet.of(changes, view.state.doc.length) });
  focusAfter(view);
  return { ok: true };
}

function changeIndent(view: EditorView, increase: boolean): FormatCommandResult {
  const { from: startNum, to: endNum } = lineRangeForSelection(view);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let n = startNum; n <= endNum; n++) {
    const line = view.state.doc.line(n);
    if (increase) {
      changes.push({ from: line.from, to: line.from, insert: INDENT });
    } else if (line.text.startsWith(INDENT)) {
      changes.push({ from: line.from, to: line.from + INDENT.length, insert: "" });
    } else if (line.text.startsWith("\t")) {
      changes.push({ from: line.from, to: line.from + 1, insert: "" });
    } else if (line.text.startsWith(" ")) {
      changes.push({ from: line.from, to: line.from + 1, insert: "" });
    }
  }

  if (changes.length === 0) {
    focusAfter(view);
    return { ok: true };
  }
  view.dispatch({ changes: ChangeSet.of(changes, view.state.doc.length) });
  focusAfter(view);
  return { ok: true };
}

/** 用 HTML 标签包裹；已成对包裹则去掉。 */
function toggleHtmlTag(view: EditorView, tag: string): FormatCommandResult {
  return toggleWrap(view, `<${tag}>`, `</${tag}>`);
}

/** 纯外观样式（颜色/字号/行高）：不写入文档，复制不含代码。 */
function applyAppearanceStyle(
  view: EditorView,
  styleKey: "color" | "background-color" | "font-size" | "line-height",
  styleValue: string,
): FormatCommandResult {
  const patch =
    styleKey === "color"
      ? { color: styleValue }
      : styleKey === "background-color"
        ? { backgroundColor: styleValue }
        : styleKey === "font-size"
          ? { fontSize: styleValue }
          : { lineHeight: styleValue };
  const ok = applyVisualStyle(view, patch);
  return { ok };
}

const ALIGN_DIV_RE =
  /^<div\s+style="text-align:\s*(left|center|right|justify);?\s*">([\s\S]*)<\/div>$/i;

function setLineAlign(view: EditorView, align: FormatAlign): FormatCommandResult {
  const { from: startNum, to: endNum } = lineRangeForSelection(view);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let n = startNum; n <= endNum; n++) {
    const line = view.state.doc.line(n);
    const text = line.text;
    const m = text.match(ALIGN_DIV_RE);
    if (m) {
      const inner = m[2] ?? "";
      if ((m[1] ?? "").toLowerCase() === align) {
        changes.push({ from: line.from, to: line.to, insert: inner });
      } else {
        changes.push({
          from: line.from,
          to: line.to,
          insert: `<div style="text-align: ${align}">${inner}</div>`,
        });
      }
    } else {
      changes.push({
        from: line.from,
        to: line.to,
        insert: `<div style="text-align: ${align}">${text}</div>`,
      });
    }
  }

  view.dispatch({ changes: ChangeSet.of(changes, view.state.doc.length) });
  focusAfter(view);
  return { ok: true };
}

export function runFormatOnView(view: EditorView, command: FormatCommand): FormatCommandResult {
  switch (command.type) {
    case "italic":
      return toggleWrap(view, "*");
    case "strikethrough":
      return toggleWrap(view, "~~");
    case "inlineCode":
      return toggleWrap(view, "`");
    case "underline":
      return toggleHtmlTag(view, "u");
    case "superscript":
      return toggleHtmlTag(view, "sup");
    case "subscript":
      return toggleHtmlTag(view, "sub");
    case "heading":
      return setHeadingLevel(view, command.level);
    case "unorderedList":
      return toggleList(view, false);
    case "orderedList":
      return toggleList(view, true);
    case "indent":
      return changeIndent(view, true);
    case "outdent":
      return changeIndent(view, false);
    case "fontSize":
      return applyAppearanceStyle(view, "font-size", command.size);
    case "fontColor":
      return applyAppearanceStyle(view, "color", command.color);
    case "backgroundColor":
      return applyAppearanceStyle(view, "background-color", command.color);
    case "align":
      return setLineAlign(view, command.align);
    case "lineHeight":
      return applyAppearanceStyle(view, "line-height", command.value);
    default:
      return { ok: false };
  }
}
