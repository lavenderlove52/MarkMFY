/**
 * 格式工具栏桥：Editor 挂载时注册活跃 EditorView，
 * 工具栏经 index 导出调用，避免跨模块深路径 import。
 */
import type { EditorView } from "@codemirror/view";
import {
  runFormatOnView,
  type FormatCommand,
  type FormatCommandResult,
  type FormatAlign,
} from "./formatCommands";

let activeView: EditorView | null = null;

export function setActiveEditorView(view: EditorView | null): void {
  activeView = view;
}

export function hasActiveEditorView(): boolean {
  return activeView != null;
}

export function getActiveEditorView(): EditorView | null {
  return activeView;
}

/** 对当前活跃编辑器执行格式命令；无 view 时返回 false。 */
export function runFormatCommand(command: FormatCommand): FormatCommandResult {
  if (!activeView) return { ok: false };
  return runFormatOnView(activeView, command);
}

export type { FormatCommand, FormatCommandResult, FormatAlign };
