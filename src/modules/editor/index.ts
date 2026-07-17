/**
 * Editor 模块：CodeMirror6 装配、Decoration 渲染、语言高亮支持。
 * 依赖 filesystem/ipc（读写文件）与 tabs（当前激活文档）。
 *
 * ## 稳定公共 API（V1.0 冻结，面向未来扩展）
 *
 * - `Editor` / `FormatToolbar` / `EditorStatusBar`：编辑器、格式工具栏、底部统计条
 * - `navigateEditorSelection` / `setEditorNavigateHandler`：选区跳转桥
 * - `replaceInActiveEditor` / `setEditorReplaceHandler`：替换桥
 * - `runFormatCommand` / `hasActiveEditorView`：格式工具栏桥
 * - `isMarkdownPath`：是否按 Markdown Live Preview 打开
 * - `EditorSelectionTarget`：跳转目标类型
 * - `joinPath` / `dirName`：路径拼接（含 `..` 规范化），供导出等模块复用
 * - `renderKatexHtml`：KaTeX 公式 HTML 字符串，供导出管线复用
 *
 * 扩展方禁止深路径 import `modules/editor/**` 内部文件。
 * 插件加载器尚不在范围内；上述桥接 API 即编辑器侧扩展点。
 */
export { default as Editor } from "./Editor.vue";
export { default as FormatToolbar } from "./components/FormatToolbar.vue";
export { default as EditorStatusBar } from "./components/EditorStatusBar.vue";
export {
  setEditorNavigateHandler,
  navigateEditorSelection,
  setEditorReplaceHandler,
  replaceInActiveEditor,
  type EditorSelectionTarget,
} from "./navBridge";
export {
  runFormatCommand,
  hasActiveEditorView,
  type FormatCommand,
  type FormatCommandResult,
} from "./formatBridge";
export { isMarkdownPath } from "./language/fileMode";
export { dirName, joinPath } from "./core/paths";
export { renderKatexHtml } from "./decorations/mathRender";
