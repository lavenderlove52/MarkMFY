import { Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { markdownLanguageSupport } from "../language/markdown";
import { markmfyHighlightStyle } from "../language/highlight";
import {
  isMarkdownPath,
  resolveLanguageByFilename,
} from "../language/fileMode";
import { livePreviewExtension, type ResolveImageSrc } from "../decorations/livePreview";
import { visualStyleExtension } from "../decorations/styleMarks";
import { preloadMermaid } from "../decorations/mermaidRenderer";

export interface EditorCallbacks {
  /** 文档有改动时调用（不再传全文，避免每键 O(n) 拷贝）。 */
  onDirty: () => void;
  onSave: () => void;
  resolveImageSrc: ResolveImageSrc;
  onPasteImage: (file: File) => void;
}

export interface EditorExtensionBundle {
  extensions: Extension[];
  /** 非 Markdown 文件用于异步挂载语言包；Markdown 模式为空 compartment。 */
  languageCompartment: Compartment;
}

export interface CreateEditorExtensionsOptions {
  /**
   * 超大文档优先保证输入/滚动流畅，降级为纯文本编辑，避免 Live Preview 全文块装饰扫描。
   */
  largeDocument?: boolean;
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

function baseEditorExtensions(callbacks: EditorCallbacks): Extension[] {
  return [
    // 至少保留 20 步撤销（含文字与外观颜色等）
    history({ minDepth: 20 }),
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
    syntaxHighlighting(markmfyHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        callbacks.onDirty();
      }
    }),
  ];
}

function imageInsertHandlers(callbacks: EditorCallbacks): Extension {
  return EditorView.domEventHandlers({
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
  });
}

/** 组装 CM6 编辑器需要的全部扩展：保存快捷键、markdown 语言、Live Preview、图片粘贴/拖拽。 */
export function createMarkdownExtensions(callbacks: EditorCallbacks): Extension[] {
  return createEditorExtensions("", callbacks).extensions;
}

/**
 * 按文件路径选择编辑模式：
 * - `.md` 等：Markdown + Live Preview + 图片粘贴
 * - 其它（如 `.json`）：纯文本编辑，避免 Markdown 把 `_` / URL 当成斜体和链接
 */
export function createEditorExtensions(
  filePath: string,
  callbacks: EditorCallbacks,
  options: CreateEditorExtensionsOptions = {},
): EditorExtensionBundle {
  const languageCompartment = new Compartment();
  const markdownPath = isMarkdownPath(filePath);
  const livePreview = markdownPath && !options.largeDocument;

  if (livePreview) {
    preloadMermaid();
    return {
      languageCompartment,
      extensions: [
        ...baseEditorExtensions(callbacks),
        languageCompartment.of(markdownLanguageSupport()),
        livePreviewExtension(callbacks.resolveImageSrc),
        visualStyleExtension(),
        imageInsertHandlers(callbacks),
      ],
    };
  }

  if (markdownPath) {
    return {
      languageCompartment,
      extensions: [
        ...baseEditorExtensions(callbacks),
        languageCompartment.of([]),
        imageInsertHandlers(callbacks),
      ],
    };
  }

  return {
    languageCompartment,
    extensions: [...baseEditorExtensions(callbacks), languageCompartment.of([])],
  };
}

/** 非 Markdown 文件按扩展名异步挂载语言高亮（json/xml/ts 等）。 */
export async function loadPlainFileLanguage(
  view: EditorView,
  compartment: Compartment,
  filePath: string,
): Promise<void> {
  if (isMarkdownPath(filePath)) return;
  const desc = resolveLanguageByFilename(filePath);
  if (!desc) return;
  try {
    const support = await desc.load();
    view.dispatch({ effects: compartment.reconfigure(support) });
  } catch (err) {
    console.warn("[markmfy] failed to load file language", filePath, err);
  }
}
