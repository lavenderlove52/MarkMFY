/**
 * Export 模块：导出为 PDF/HTML（markdown-it + Shiki 管线）。
 * 内容由调用方传入（通常来自 tabs），本模块不反向依赖其它业务 UI。
 */
export type { RenderMarkdownOptions, ExportKind } from "./types";
export { renderMarkdownDocument } from "./renderHtml";
export { exportHtmlFile, exportPdfViaPrint, type ExportDocumentInput } from "./exportActions";
