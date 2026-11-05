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
 *
 * 注意：空 iframe 先加载 about:blank 再 doc.write 时 onload 会触发两次，
 * 导致 print() 叠两个对话框、取消要点两次。这里用 srcdoc + once 只打一次。
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

      let settled = false;
      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve();
      };

      let printStarted = false;
      const runPrint = (): void => {
        if (printStarted) return;
        printStarted = true;
        const win = iframe.contentWindow;
        if (!win) {
          finish(new Error("无法打开打印窗口"));
          return;
        }
        const onAfterPrint = (): void => {
          win.removeEventListener("afterprint", onAfterPrint);
          finish();
        };
        win.addEventListener("afterprint", onAfterPrint);
        // 部分 WebView 取消不派发 afterprint，超时兜底避免 iframe 泄漏
        window.setTimeout(onAfterPrint, 120_000);
        try {
          win.focus();
          win.print();
        } catch (err) {
          win.removeEventListener("afterprint", onAfterPrint);
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      };

      iframe.addEventListener(
        "load",
        () => {
          window.setTimeout(runPrint, 100);
        },
        { once: true },
      );

      document.body.appendChild(iframe);
      iframe.srcdoc = html;
    });
  } catch (err) {
    toastError(err, "导出 PDF 失败");
  }
}
