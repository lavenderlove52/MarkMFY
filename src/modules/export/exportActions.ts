/** 导出 HTML / 打开打印预览（PDF）。 */
import { pickSaveFile, toAssetUrl, writeFile } from "../../ipc";
import { showToast, toastError } from "../../notify";
import { renderMarkdownDocument } from "./renderHtml";

export interface ExportDocumentInput {
  markdown: string;
  title: string;
  /** 当前 .md 文件绝对路径，用于解析相对图片 */
  filePath?: string | null;
}

function dirName(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return i >= 0 ? filePath.slice(0, i) : filePath;
}

/** 导出给系统浏览器打开的 HTML 使用 file://，否则相对图裂。 */
function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
}

function buildRenderOptions(
  input: ExportDocumentInput,
  imageMode: "file" | "asset",
): Parameters<typeof renderMarkdownDocument>[1] {
  const baseDir = input.filePath ? dirName(input.filePath) : undefined;
  return {
    title: input.title,
    baseDir,
    resolveImageSrc: (absolutePath) =>
      imageMode === "asset" ? toAssetUrl(absolutePath) : toFileUrl(absolutePath),
  };
}

/**
 * 弹出另存对话框，写入完整 HTML 文件。
 * @returns 保存路径；用户取消返回 null
 */
export async function exportHtmlFile(input: ExportDocumentInput): Promise<string | null> {
  try {
    const defaultName = input.title.replace(/[\\/:*?"<>|]+/g, "_") || "export";
    const path = await pickSaveFile({
      title: "导出 HTML",
      defaultPath: `${defaultName}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!path) return null;

    const html = await renderMarkdownDocument(input.markdown, buildRenderOptions(input, "file"));
    await writeFile(path, html);
    showToast("HTML 已导出", "success", 2500);
    return path;
  } catch (err) {
    toastError(err, "导出 HTML 失败");
    return null;
  }
}

/**
 * 用隐藏 iframe 调起系统打印对话框（可选用「Microsoft Print to PDF」）。
 */
export async function exportPdfViaPrint(input: ExportDocumentInput): Promise<void> {
  try {
    const html = await renderMarkdownDocument(input.markdown, buildRenderOptions(input, "asset"));

    await new Promise<void>((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";

      const cleanup = (): void => {
        iframe.remove();
      };

      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            cleanup();
            reject(new Error("无法打开打印窗口"));
            return;
          }
          window.setTimeout(() => {
            try {
              win.focus();
              win.print();
            } finally {
              window.setTimeout(cleanup, 1000);
              resolve();
            }
          }, 200);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      if (!doc) {
        cleanup();
        reject(new Error("无法写入打印文档"));
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
    });
  } catch (err) {
    toastError(err, "导出 PDF 失败");
  }
}
