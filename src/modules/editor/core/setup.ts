import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { markdownLanguageSupport } from "../language/markdown";
import { markmfyHighlightStyle } from "../language/highlight";
import { livePreviewExtension, type ResolveImageSrc } from "../decorations/livePreview";
import { preloadMermaid } from "../decorations/mermaidRenderer";

export interface EditorCallbacks {
  /** 文档有改动时调用（不再传全文，避免每键 O(n) 拷贝）。 */
  onDirty: () => void;
  onSave: () => void;
  resolveImageSrc: ResolveImageSrc;
  onPasteImage: (file: File) => void;
}

function pickImageFile(items: DataTransferItemList | null | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

/** 组装 CM6 编辑器需要的全部扩展：保存快捷键、markdown 语言、Live Preview、图片粘贴/拖拽。 */
export function createMarkdownExtensions(callbacks: EditorCallbacks): Extension[] {
  // 后台预加载 mermaid 包，打开含流程图的文档时少等一轮网络/解析
  preloadMermaid();
  return [
    history(),
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          callbacks.onSave();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    markdownLanguageSupport(),
    syntaxHighlighting(markmfyHighlightStyle, { fallback: true }),
    livePreviewExtension(callbacks.resolveImageSrc),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        callbacks.onDirty();
      }
    }),
    EditorView.domEventHandlers({
      paste(event) {
        const file = pickImageFile(event.clipboardData?.items);
        if (!file) return false;
        callbacks.onPasteImage(file);
        return true;
      },
      drop(event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (!imageFile) return false;
        event.preventDefault();
        callbacks.onPasteImage(imageFile);
        return true;
      },
    }),
  ];
}
