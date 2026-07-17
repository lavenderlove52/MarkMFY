/**
 * 编辑器导航/替换桥：Search 等模块通过 index 导出调用，
 * Editor 挂载时注册实现，避免跨模块深路径 import。
 */

export interface EditorSelectionTarget {
  from: number;
  to: number;
}

export type EditorNavigateHandler = (target: EditorSelectionTarget) => void;

export type EditorReplaceHandler = (args: {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  replaceAll: boolean;
}) => { count: number } | null;

let navigateHandler: EditorNavigateHandler | null = null;
let replaceHandler: EditorReplaceHandler | null = null;

export function setEditorNavigateHandler(handler: EditorNavigateHandler | null): void {
  navigateHandler = handler;
}

export function navigateEditorSelection(target: EditorSelectionTarget): boolean {
  if (!navigateHandler) return false;
  navigateHandler(target);
  return true;
}

export function setEditorReplaceHandler(handler: EditorReplaceHandler | null): void {
  replaceHandler = handler;
}

export function replaceInActiveEditor(args: {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  replaceAll: boolean;
}): { count: number } | null {
  return replaceHandler?.(args) ?? null;
}
