/** Export 模块类型。 */

export interface RenderMarkdownOptions {
  /** 文档标题（用于 `<title>`） */
  title?: string;
  /** Markdown 文件所在目录，用于解析相对图片路径 */
  baseDir?: string;
  /** 将相对路径图片转为可访问的 URL（如 convertFileSrc） */
  resolveImageSrc?: (absolutePath: string) => string;
}

export type ExportKind = "html" | "pdf";
