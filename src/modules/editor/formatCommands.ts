/**
 * 格式命令：对 EditorView 选区/当前行应用 Markdown 或受控 HTML 标记。
 */
import type { EditorView } from "@codemirror/view";
import { ChangeSet, EditorSelection } from "@codemirror/state";

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
  | { type: "lineHeight"; value: string }
  | { type: "clearFormatting" };

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

type HtmlStyleKey = "color" | "background-color" | "font-size" | "line-height";

/** 与 htmlPreview.ts 的 SPAN_RE 匹配：`<span style="a: v; b: v">`。 */
const STYLE_SPAN_RE = /^<span\s+style="([^"]*)">([\s\S]*)<\/span>$/i;

/** 解析 style 字符串为键值对（键统一小写）。 */
function parseStyleAttrs(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of raw.split(";")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (key && val) map.set(key, val);
  }
  return map;
}

/** 组装 style 字符串：保持插入顺序，值为空的键跳过。 */
function buildStyleAttr(entries: Array<[string, string]>): string {
  return entries.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
}

/**
 * 按行包裹 span：跨行选区若整段包一个 span，markdown 解析易把它当普通文本。
 * 行内已有 span 时合并属性（改写其 style），避免产生嵌套 span——
 * htmlPreview.ts 的非贪婪正则对嵌套 span 支持不好。
 */
function wrapLinesWithSpan(text: string, styleKey: HtmlStyleKey, styleValue: string): string {
  const SPAN_RE = /<span\s+style="([^"]*)">([\s\S]*?)<\/span>/gi;
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      const parts: string[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      SPAN_RE.lastIndex = 0;
      while ((m = SPAN_RE.exec(line))) {
        const before = line.slice(last, m.index);
        if (before) parts.push(`<span style="${styleKey}: ${styleValue}">${before}</span>`);
        const entries = parseStyleAttrs(m[1] ?? "");
        entries.set(styleKey, styleValue);
        const next = buildStyleAttr([...entries]);
        parts.push(`<span style="${next}">${m[2] ?? ""}</span>`);
        last = m.index + m[0].length;
      }
      const tail = line.slice(last);
      if (tail) parts.push(`<span style="${styleKey}: ${styleValue}">${tail}</span>`);
      return parts.join("");
    })
    .join("\n");
}

/**
 * 外观样式（颜色/字号/行高）写入文档：`<span style="...">选中文本</span>`。
 * - 选区恰被白名单 span 紧贴包裹且已有该属性：值相同则移除（再点一次取消），不同则改写；
 *   style 删空则整个 span 拆掉。
 * - 选区在白名单 span 内部：合并进该 span 的 style，不产生嵌套 span。
 * - 其余：按行包裹新 span。
 */
function applyHtmlStyleSpan(
  view: EditorView,
  styleKey: HtmlStyleKey,
  styleValue: string,
): FormatCommandResult {
  const { state } = view;
  const sel = state.selection.main;
  if (sel.from === sel.to) {
    focusAfter(view);
    return { ok: false };
  }
  const from = sel.from;
  const to = sel.to;
  const selected = state.doc.sliceString(from, to);

  // 「无背景」= 移除 background-color
  const isRemoveOp = styleKey === "background-color" && styleValue === "transparent";

  // 情形 1：选区恰好被一个 span 紧贴包裹
  const selfMatch = selected.match(STYLE_SPAN_RE);
  if (selfMatch) {
    const rawStyle = selfMatch[1] ?? "";
    const inner = selfMatch[2] ?? "";
    const entries = parseStyleAttrs(rawStyle);
    const prev = entries.get(styleKey);
    if (prev === styleValue || isRemoveOp) {
      entries.delete(styleKey);
      const next = buildStyleAttr([...entries]);
      if (next) {
        view.dispatch({
          changes: { from, to, insert: `<span style="${next}">${inner}</span>` },
          selection: { anchor: from + `<span style="${next}">`.length },
        });
      } else {
        view.dispatch({
          changes: { from, to, insert: inner },
          selection: { anchor: from },
        });
      }
    } else {
      entries.set(styleKey, styleValue);
      const next = buildStyleAttr([...entries]);
      view.dispatch({
        changes: { from, to, insert: `<span style="${next}">${inner}</span>` },
        selection: { anchor: from + `<span style="${next}">`.length },
      });
    }
    focusAfter(view);
    return { ok: true };
  }

  // 情形 2：选区在某个白名单 span 内部（未被紧贴包裹）→ 找到覆盖选区的 span 并合并属性
  const lineStart = state.doc.lineAt(from).from;
  const lineEnd = state.doc.lineAt(to).to;
  const lineText = state.doc.sliceString(lineStart, lineEnd);
  const SPAN_SCAN_RE = /<span\s+style="([^"]*)">([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  let merged = false;
  while ((m = SPAN_SCAN_RE.exec(lineText))) {
    const sFrom = lineStart + m.index;
    const sTo = sFrom + m[0].length;
    if (sFrom < from && sTo > to) {
      const rawStyle = m[1] ?? "";
      const inner = m[2] ?? "";
      const oldPrefixLen = m[0].indexOf(">") + 1;
      const entries = parseStyleAttrs(rawStyle);
      const prev = entries.get(styleKey);
      if (prev === styleValue || isRemoveOp) entries.delete(styleKey);
      else entries.set(styleKey, styleValue);
      const next = buildStyleAttr([...entries]);
      if (next) {
        const prefix = `<span style="${next}">`;
        // 旧内容区起点 = sFrom + oldPrefixLen，新内容区起点 = sFrom + prefix.length
        view.dispatch({
          changes: { from: sFrom, to: sTo, insert: `${prefix}${inner}</span>` },
          selection: { anchor: sFrom + prefix.length + (from - sFrom - oldPrefixLen) },
        });
      } else {
        view.dispatch({
          changes: { from: sFrom, to: sTo, insert: inner },
          selection: { anchor: from - oldPrefixLen },
        });
      }
      merged = true;
      break;
    }
  }
  if (merged) {
    focusAfter(view);
    return { ok: true };
  }

  // 情形 3：普通包裹（按行拆分，已有 span 合并属性，避免嵌套与跨段 span）
  const insert = wrapLinesWithSpan(selected, styleKey, styleValue);
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from, head: from + insert.length },
  });
  focusAfter(view);
  return { ok: true };
}

/** 外观样式（颜色/字号/行高）：写入文档 `<span style>`，随文档保存持久化。 */
function applyAppearanceStyle(
  view: EditorView,
  styleKey: HtmlStyleKey,
  styleValue: string,
): FormatCommandResult {
  return applyHtmlStyleSpan(view, styleKey, styleValue);
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
    case "clearFormatting":
      return clearFormatting(view);
    default:
      return { ok: false };
  }
}

/**
 * 清除格式：对选区（空选区取当前行）剥掉受控 HTML 包裹
 * （span style / u / sup / sub / div align），恢复纯文本。可 Ctrl+Z。
 */
function clearFormatting(view: EditorView): FormatCommandResult {
  const { state } = view;
  const sel = state.selection.main;
  // 覆盖范围：选区所在的所有行（选中部分行时也整行处理，保证标签成对剥离）
  const startLine = state.doc.lineAt(sel.from);
  const endLine = state.doc.lineAt(sel.to === sel.from ? sel.from : Math.max(sel.from, sel.to - 1));
  const rangeFrom = startLine.from;
  const rangeTo = endLine.to;
  const text = state.doc.sliceString(rangeFrom, rangeTo);

  // 递归剥离（嵌套时先内后外）
  const CLEAR_RE = /<(span|u|sup|sub)(\s+style="[^"]*")?>((?:[^<]|<(?!\/?\1))*?)<\/\1>|<div\s+style="text-align:\s*(?:left|center|right|justify);?\s*">([\s\S]*?)<\/div>/gi;
  let cleared = text;
  let prev = "";
  while (cleared !== prev) {
    prev = cleared;
    cleared = cleared.replace(CLEAR_RE, (_full, _tag: string, _style: string, inner: string | undefined, divInner: string | undefined) => {
      return divInner !== undefined ? divInner : inner ?? "";
    });
  }

  if (cleared === text) {
    focusAfter(view);
    return { ok: true };
  }

  const changeSet = ChangeSet.of(
    [{ from: rangeFrom, to: rangeTo, insert: cleared }],
    state.doc.length,
  );
  view.dispatch({
    changes: changeSet,
    selection: { anchor: rangeFrom },
  });
  focusAfter(view);
  return { ok: true };
}
