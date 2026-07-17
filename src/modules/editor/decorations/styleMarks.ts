/**
 * 纯外观样式标记：不写入文档文本，复制/保存都不带颜色代码。
 * 通过 invertedEffects 接入 CM6 history，可与文字编辑一起 Ctrl+Z 撤销。
 *
 * 颜色 / 背景色走 CSS Custom Highlight API（不插入 span），避免与
 * .mm-inline-code 等 mark 部分重叠时把灰底胶囊拆成断层碎片。
 * 字号 / 行高仍用 Decoration.mark（Highlight API 不支持这些属性）。
 */
import {
  EditorState,
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  Transaction,
  type ChangeDesc,
  type Extension,
  type Range,
} from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

export interface VisualStyle {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  lineHeight?: string;
}

interface MarkPiece {
  from: number;
  to: number;
  style: VisualStyle;
}

class StyleMark extends RangeValue {
  constructor(readonly style: VisualStyle) {
    super();
  }

  eq(other: RangeValue): boolean {
    if (!(other instanceof StyleMark)) return false;
    return (
      this.style.color === other.style.color &&
      this.style.backgroundColor === other.style.backgroundColor &&
      this.style.fontSize === other.style.fontSize &&
      this.style.lineHeight === other.style.lineHeight
    );
  }

  merge(patch: VisualStyle): StyleMark | null {
    const next: VisualStyle = { ...this.style };
    if (patch.color !== undefined) next.color = patch.color || undefined;
    if (patch.backgroundColor !== undefined) {
      next.backgroundColor =
        !patch.backgroundColor || patch.backgroundColor === "transparent"
          ? undefined
          : patch.backgroundColor;
    }
    if (patch.fontSize !== undefined) next.fontSize = patch.fontSize || undefined;
    if (patch.lineHeight !== undefined) next.lineHeight = patch.lineHeight || undefined;
    if (!next.color && !next.backgroundColor && !next.fontSize && !next.lineHeight) {
      return null;
    }
    return new StyleMark(next);
  }

  /** 仅字号/行高走 Decoration.mark（会拆 DOM）；颜色走 Highlight。 */
  toSizeCssVars(): string {
    const parts: string[] = [];
    if (this.style.fontSize) parts.push(`--mm-vs-size: ${this.style.fontSize}`);
    if (this.style.lineHeight) parts.push(`--mm-vs-lh: ${this.style.lineHeight}`);
    return parts.join("; ");
  }

  /** 无 Highlight API 时的降级：颜色也写进 mark。 */
  toFullCssVars(): string {
    const parts: string[] = [];
    if (this.style.color) parts.push(`--mm-vs-color: ${this.style.color}`);
    if (this.style.backgroundColor) {
      parts.push(`--mm-vs-bg: ${this.style.backgroundColor}`);
    }
    if (this.style.fontSize) parts.push(`--mm-vs-size: ${this.style.fontSize}`);
    if (this.style.lineHeight) parts.push(`--mm-vs-lh: ${this.style.lineHeight}`);
    return parts.join("; ");
  }

  hasSizeStyle(): boolean {
    return !!(this.style.fontSize || this.style.lineHeight);
  }

  hasPaintStyle(): boolean {
    return !!(this.style.color || this.style.backgroundColor);
  }

  hasStyle(): boolean {
    return this.hasSizeStyle() || this.hasPaintStyle();
  }
}

function supportsCssHighlight(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === "function"
  );
}

/** 用指定标记替换 [from,to) 内的外观样式（可撤销）。 */
const setRangeMarksEffect = StateEffect.define<{
  from: number;
  to: number;
  marks: MarkPiece[];
}>({
  map: (value, change) => ({
    from: change.mapPos(value.from, 1),
    to: change.mapPos(value.to, -1),
    marks: value.marks
      .map((m) => ({
        from: change.mapPos(m.from, 1),
        to: change.mapPos(m.to, -1),
        style: m.style,
      }))
      .filter((m) => m.to > m.from),
  }),
});

function mapStyleSet(set: RangeSet<StyleMark>, changes: ChangeDesc): RangeSet<StyleMark> {
  if (changes.empty) return set;
  return set.map(changes);
}

function snapshotMarks(set: RangeSet<StyleMark>, from: number, to: number): MarkPiece[] {
  const out: MarkPiece[] = [];
  if (to <= from) return out;
  set.between(from, to, (mFrom, mTo, value) => {
    const a = Math.max(mFrom, from);
    const b = Math.min(mTo, to);
    if (b > a) out.push({ from: a, to: b, style: { ...value.style } });
  });
  return out;
}

function replaceRangeMarks(
  set: RangeSet<StyleMark>,
  from: number,
  to: number,
  marks: MarkPiece[],
): RangeSet<StyleMark> {
  const cleared = set.update({
    filter: (f, t) => t <= from || f >= to,
    filterFrom: from,
    filterTo: to,
  });
  if (marks.length === 0) return cleared;
  const add = marks
    .filter((m) => m.to > m.from)
    .map((m) => new StyleMark(m.style).range(m.from, m.to));
  return cleared.update({ add });
}

function applyPatchToRange(
  set: RangeSet<StyleMark>,
  from: number,
  to: number,
  patch: VisualStyle,
): RangeSet<StyleMark> {
  if (to <= from) return set;

  const pieces: Range<StyleMark>[] = [];
  set.between(from, to, (mFrom, mTo, value) => {
    if (mTo <= from || mFrom >= to) return;
    if (mFrom < from) pieces.push(value.range(mFrom, from));
    const overlapFrom = Math.max(mFrom, from);
    const overlapTo = Math.min(mTo, to);
    const merged = value.merge(patch);
    if (merged) pieces.push(merged.range(overlapFrom, overlapTo));
    if (mTo > to) pieces.push(value.range(to, mTo));
  });

  let cursor = from;
  const covered: { from: number; to: number }[] = [];
  set.between(from, to, (mFrom, mTo) => {
    covered.push({ from: Math.max(mFrom, from), to: Math.min(mTo, to) });
  });
  covered.sort((a, b) => a.from - b.from);
  for (const c of covered) {
    if (cursor < c.from) {
      const fresh = new StyleMark({}).merge(patch);
      if (fresh) pieces.push(fresh.range(cursor, c.from));
    }
    cursor = Math.max(cursor, c.to);
  }
  if (cursor < to) {
    const fresh = new StyleMark({}).merge(patch);
    if (fresh) pieces.push(fresh.range(cursor, to));
  }

  let next = set.update({
    filter: (f, t) => t <= from || f >= to,
    filterFrom: from,
    filterTo: to,
  });
  if (pieces.length > 0) {
    next = next.update({ add: pieces });
  }
  return next;
}

function buildMarkDecorations(set: RangeSet<StyleMark>, useHighlightPaint: boolean): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  let pending: { from: number; to: number; value: StyleMark } | null = null;
  const flush = () => {
    if (!pending) return;
    const css = useHighlightPaint ? pending.value.toSizeCssVars() : pending.value.toFullCssVars();
    const needMark = useHighlightPaint ? pending.value.hasSizeStyle() : pending.value.hasStyle();
    if (needMark && css) {
      ranges.push(
        Decoration.mark({
          class: "mm-visual-style",
          attributes: { style: css },
        }).range(pending.from, pending.to),
      );
    }
    pending = null;
  };
  set.between(0, 1e9, (from, to, value) => {
    if (to <= from || !value.hasStyle()) return;
    if (pending && pending.to === from && pending.value.eq(value)) {
      pending.to = to;
      return;
    }
    flush();
    pending = { from, to, value };
  });
  flush();
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

const styleMarksField = StateField.define<RangeSet<StyleMark>>({
  create() {
    return RangeSet.empty;
  },
  update(value, tr) {
    let next = mapStyleSet(value, tr.changes);
    for (const e of tr.effects) {
      if (e.is(setRangeMarksEffect)) {
        const { from, to, marks } = e.value;
        const f = tr.changes.mapPos(from, 1);
        const t = tr.changes.mapPos(to, -1);
        const mappedMarks = marks
          .map((m) => ({
            from: tr.changes.mapPos(m.from, 1),
            to: tr.changes.mapPos(m.to, -1),
            style: m.style,
          }))
          .filter((m) => m.to > m.from);
        next = replaceRangeMarks(next, f, t, mappedMarks);
      }
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      return buildMarkDecorations(state.field(field), supportsCssHighlight());
    }),
});

/** 把外观样式变更登记进撤销栈：撤销时恢复变更前的标记快照。 */
const visualStyleHistory = invertedEffects.of((tr) => {
  const out: ReturnType<typeof setRangeMarksEffect.of>[] = [];
  for (const e of tr.effects) {
    if (!e.is(setRangeMarksEffect)) continue;
    const set = tr.startState.field(styleMarksField, false);
    if (!set) continue;
    const before = snapshotMarks(set, e.value.from, e.value.to);
    out.push(
      setRangeMarksEffect.of({
        from: e.value.from,
        to: e.value.to,
        marks: before,
      }),
    );
  }
  return out;
});

function paintKey(color?: string, backgroundColor?: string): string {
  const raw = `${color ?? ""}|${backgroundColor ?? ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `mm-vs-${(hash >>> 0).toString(36)}`;
}

function domRangeFor(view: EditorView, from: number, to: number): globalThis.Range | null {
  if (to <= from) return null;
  try {
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch {
    return null;
  }
}

type HighlightGroup = {
  color?: string;
  backgroundColor?: string;
  ranges: { from: number; to: number }[];
};

const visualPaintPlugin = ViewPlugin.fromClass(
  class {
    private styleEl: HTMLStyleElement | null = null;
    private names = new Set<string>();
    private destroyed = false;

    constructor(view: EditorView) {
      // 首帧 DOM 就绪后再挂 Highlight，避免 Range 指到空节点
      view.requestMeasure({
        read: () => {
          if (!this.destroyed) this.sync(view);
        },
      });
    }

    update(update: ViewUpdate) {
      const fieldChanged =
        update.state.field(styleMarksField) !== update.startState.field(styleMarksField);
      // selectionSet：Live Preview 会随光标显隐语法标记并重建 DOM；
      // 必须在 DOM 更新后再重绑 Highlight，否则颜色会「点一下就没、点别处才回来」。
      if (
        !(
          fieldChanged ||
          update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          update.selectionSet
        )
      ) {
        return;
      }
      const view = update.view;
      view.requestMeasure({
        read: () => {
          if (!this.destroyed) this.sync(view);
        },
      });
    }

    destroy() {
      this.destroyed = true;
      this.clear();
    }

    private clear() {
      if (supportsCssHighlight()) {
        for (const name of this.names) {
          CSS.highlights.delete(name);
        }
      }
      this.names.clear();
      this.styleEl?.remove();
      this.styleEl = null;
    }

    private sync(view: EditorView) {
      this.clear();
      if (!supportsCssHighlight()) return;

      const set = view.state.field(styleMarksField, false);
      if (!set) return;

      const groups = new Map<string, HighlightGroup>();
      set.between(0, view.state.doc.length, (from, to, value) => {
        if (to <= from || !value.hasPaintStyle()) return;
        const key = paintKey(value.style.color, value.style.backgroundColor);
        let group = groups.get(key);
        if (!group) {
          group = {
            color: value.style.color,
            backgroundColor: value.style.backgroundColor,
            ranges: [],
          };
          groups.set(key, group);
        }
        group.ranges.push({ from, to });
      });
      if (groups.size === 0) return;

      const HighlightCtor = (globalThis as unknown as { Highlight: typeof Highlight }).Highlight;
      const rules: string[] = [];
      for (const [name, group] of groups) {
        const highlight = new HighlightCtor();
        for (const { from, to } of group.ranges) {
          let pos = from;
          while (pos < to) {
            const line = view.state.doc.lineAt(pos);
            const segTo = Math.min(to, line.to);
            if (segTo > pos) {
              const domRange = domRangeFor(view, pos, segTo);
              if (domRange) {
                try {
                  highlight.add(domRange);
                } catch {
                  /* 视口外或 widget 位置可能无法建 Range */
                }
              }
            }
            if (segTo >= to) break;
            pos = line.to + 1;
          }
        }
        CSS.highlights.set(name, highlight);
        this.names.add(name);
        const props: string[] = [];
        if (group.color) props.push(`color: ${group.color}`);
        if (group.backgroundColor) props.push(`background-color: ${group.backgroundColor}`);
        if (props.length) rules.push(`::highlight(${name}) { ${props.join("; ")} }`);
      }

      const el = document.createElement("style");
      el.setAttribute("data-mm-visual-highlights", "");
      el.textContent = rules.join("\n");
      document.head.appendChild(el);
      this.styleEl = el;
    }
  },
);

const visualStyleTheme = EditorView.baseTheme({
  /* 字号/行高 mark，以及无 Highlight API 时的颜色降级 */
  ".mm-visual-style": {
    color: "var(--mm-vs-color, inherit)",
    backgroundColor: "var(--mm-vs-bg, transparent)",
    fontSize: "var(--mm-vs-size, inherit)",
    lineHeight: "var(--mm-vs-lh, inherit)",
    letterSpacing: "normal",
    wordSpacing: "normal",
    display: "inline",
  },
});

export function visualStyleExtension(): Extension {
  return [styleMarksField, visualStyleHistory, visualPaintPlugin, visualStyleTheme];
}

/** 对当前选区应用纯外观样式（不改文档文本，可 Ctrl+Z 撤销）。 */
export function applyVisualStyle(view: EditorView, patch: VisualStyle): boolean {
  const sel = view.state.selection.main;
  if (sel.from === sel.to) return false;
  const set = view.state.field(styleMarksField, false);
  if (!set) return false;

  const from = sel.from;
  const to = sel.to;
  const afterSet = applyPatchToRange(set, from, to, patch);
  const marks = snapshotMarks(afterSet, from, to);

  view.dispatch({
    effects: setRangeMarksEffect.of({ from, to, marks }),
    selection: { anchor: to },
    annotations: Transaction.addToHistory.of(true),
    userEvent: "format.style",
  });
  view.focus();
  return true;
}

export function hasVisualStyleField(state: EditorState): boolean {
  return state.field(styleMarksField, false) != null;
}
