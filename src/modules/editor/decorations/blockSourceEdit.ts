import { StateEffect, StateField, type EditorState } from "@codemirror/state";

/** 主动请求把某个块（表格 / Mermaid）切到 Markdown 源码编辑态。 */
export const requestBlockSourceEdit = StateEffect.define<{ from: number; to: number }>();

/** 退出块源码编辑态。 */
export const clearBlockSourceEdit = StateEffect.define<null>();

export interface BlockSourceEditRange {
  from: number;
  to: number;
}

/**
 * 只有显式点了「编辑 / 源码编辑」才会进入源码态；光标移出该块后自动清除。
 * 绝不用“光标碰到就拆预览”——大 Mermaid 块一点就会整段变源码，看起来像渲染失败。
 */
export const blockSourceEditField = StateField.define<BlockSourceEditRange | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(requestBlockSourceEdit)) {
        next = effect.value;
      } else if (effect.is(clearBlockSourceEdit)) {
        next = null;
      }
    }
    if (next && tr.docChanged) {
      next = {
        from: tr.changes.mapPos(next.from),
        to: tr.changes.mapPos(next.to, 1),
      };
    }
    if (next && tr.selection) {
      const { from, to } = next;
      const touching = tr.state.selection.ranges.some((r) => {
        if (r.empty) return r.from >= from && r.from < to;
        return r.from < to && r.to > from;
      });
      if (!touching) next = null;
    }
    return next;
  },
});

export function isBlockInSourceEdit(state: EditorState, from: number, to: number): boolean {
  const active = state.field(blockSourceEditField, false);
  if (!active) return false;
  return Math.abs(active.from - from) <= 1 || (active.from >= from && active.from < to);
}

/** @deprecated 兼容旧名 */
export const requestTableSourceEdit = requestBlockSourceEdit;
/** @deprecated 兼容旧名 */
export const clearTableSourceEdit = clearBlockSourceEdit;
/** @deprecated 兼容旧名 */
export const tableSourceEditField = blockSourceEditField;
/** @deprecated 兼容旧名 */
export const isTableInSourceEdit = isBlockInSourceEdit;
