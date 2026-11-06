<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setActiveTabContentReader, setApplyStoreContentToEditor, useTabsStore } from "../tabs";
import { savePastedImage, toAssetUrl } from "../../ipc";
import { createEditorExtensions, loadPlainFileLanguage } from "./core/setup";
import { convertHtmlToMarkdown } from "./core/htmlPaste";
import { dirName, joinPath } from "./core/paths";
import { setEditorNavigateHandler, setEditorReplaceHandler } from "./navBridge";
import { setActiveEditorView } from "./formatBridge";
import { findNextInDoc, replaceAllInDoc } from "./textReplace";
import { flushPendingCodeBlockEdits } from "./decorations/codeBlockWidget";
import { showToast, toastError } from "../../notify";
import {
  clearEditorDocStats,
  publishEditorDocStats,
  publishEditorDocStatsFromText,
} from "./statusStats";
import type { Compartment } from "@codemirror/state";
import { isMarkdownPath } from "./language/fileMode";
import ImageFileViewer from "./components/ImageFileViewer.vue";

const tabsStore = useTabsStore();
const isImageTab = computed(() => tabsStore.activeTab?.kind === "image");
const activeImageSrc = computed(() => {
  const tab = tabsStore.activeTab;
  return tab?.kind === "image" ? toAssetUrl(tab.filePath) : "";
});
const containerRef = ref<HTMLDivElement | null>(null);
const renderError = ref<string | null>(null);
const fallbackContent = ref("");
// Live Preview 每轮输入都会更新行内装饰与整块 Widget，2MB 后优先保证输入和滚动。
const LARGE_DOCUMENT_CHARS = 2 * 1024 * 1024;
let view: EditorView | null = null;
/** 当前 view 对应的 tabId（切 tab 时先物化旧文档用）。 */
let boundTabId: string | null = null;
let languageCompartment: Compartment | null = null;
let languageLoadToken = 0;

function isLargeDocument(content: string): boolean {
  return content.length >= LARGE_DOCUMENT_CHARS;
}

function resolveImageSrc(rawPath: string): string {
  if (/^[a-z]+:\/\//i.test(rawPath) || rawPath.startsWith("data:")) {
    return rawPath;
  }
  const tab = tabsStore.activeTab;
  if (!tab) return rawPath;
  const absolutePath = joinPath(dirName(tab.filePath), rawPath);
  return toAssetUrl(absolutePath);
}

function onDirty(): void {
  const tab = tabsStore.activeTab;
  if (!tab) return;
  tabsStore.markDirty(tab.id);
}

interface AsyncPasteTarget {
  view: EditorView;
  tabId: string;
  doc: EditorState["doc"];
  from: number;
  to: number;
}

function captureAsyncPasteTarget(): AsyncPasteTarget | null {
  const tab = tabsStore.activeTab;
  if (!tab || !view) return null;
  const selection = view.state.selection.main;
  return {
    view,
    tabId: tab.id,
    doc: view.state.doc,
    from: selection.from,
    to: selection.to,
  };
}

function isAsyncPasteTargetCurrent(target: AsyncPasteTarget): boolean {
  return (
    view === target.view && tabsStore.activeTabId === target.tabId && view.state.doc === target.doc
  );
}

async function onSave(): Promise<void> {
  const tab = tabsStore.activeTab;
  if (!tab) return;
  await tabsStore.saveTab(tab.id);
}

async function onPasteImage(file: File): Promise<void> {
  const tab = tabsStore.activeTab;
  const target = captureAsyncPasteTarget();
  if (!tab || !target) return;
  try {
    const buffer = await file.arrayBuffer();
    const ext = file.type.split("/")[1] ?? "png";
    const fileName = `pasted-${Date.now()}.${ext}`;
    const relativePath = await savePastedImage(tab.filePath, fileName, new Uint8Array(buffer));
    if (!isAsyncPasteTargetCurrent(target)) {
      showToast("文件内容已变化，已取消本次图片粘贴", "info");
      return;
    }
    target.view.dispatch({
      changes: { from: target.from, to: target.to, insert: `![](${relativePath})` },
    });
  } catch (err) {
    toastError(err, "插入图片失败");
  }
}

/**
 * 富文本粘贴（飞书文档/Word/网页复制等）：转换失败或没有可用内容时退回浏览器
 * 提供的 `text/plain`，避免用户感觉"粘贴没反应"。
 */
async function onPasteHtml(html: string, plainFallback: string): Promise<void> {
  const tab = tabsStore.activeTab;
  const target = captureAsyncPasteTarget();
  if (!tab || !target) return;
  let markdown = "";
  try {
    markdown = await convertHtmlToMarkdown(html, { markdownFilePath: tab.filePath });
  } catch (err) {
    console.warn("[markmfy] 富文本粘贴转换失败，退回纯文本", err);
  }
  const insertText = markdown.trim() ? markdown : plainFallback;
  if (!insertText) return;
  if (!isAsyncPasteTargetCurrent(target)) {
    showToast("文件内容已变化，已取消本次富文本粘贴", "info");
    return;
  }
  target.view.dispatch({
    changes: { from: target.from, to: target.to, insert: insertText },
    selection: { anchor: target.from + insertText.length },
  });
}

function createState(content: string, filePath = ""): EditorState {
  const largeDocument = isLargeDocument(content);
  const bundle = createEditorExtensions(
    filePath,
    {
      onDirty,
      onSave: () => void onSave(),
      resolveImageSrc,
      onPasteImage: (file) => void onPasteImage(file),
      onPasteHtml: (html, plainFallback) => void onPasteHtml(html, plainFallback),
    },
    {
      largeDocument,
    },
  );
  languageCompartment = bundle.languageCompartment;
  const statsExt =
    filePath && isMarkdownPath(filePath) && !largeDocument
      ? EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            publishEditorDocStats(update.state.doc);
          }
        })
      : [];
  return EditorState.create({
    doc: content,
    extensions: [...bundle.extensions, statsExt],
  });
}

function refreshStatusStats(content: string, filePath: string): void {
  if (filePath && isMarkdownPath(filePath) && !isLargeDocument(content)) {
    publishEditorDocStatsFromText(content, true);
  } else {
    clearEditorDocStats();
  }
}

function scheduleLanguageLoad(filePath: string): void {
  if (!view || !languageCompartment) return;
  const token = ++languageLoadToken;
  const compartment = languageCompartment;
  const currentView = view;
  void loadPlainFileLanguage(currentView, compartment, filePath).then(() => {
    if (token !== languageLoadToken || view !== currentView) return;
  });
}

function onFallbackInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  fallbackContent.value = value;
  const tab = tabsStore.activeTab;
  if (!tab) return;
  tabsStore.syncContent(tab.id, value);
  refreshStatusStats(value, tab.filePath);
}

function flushBoundTab(): void {
  if (!view || !boundTabId) return;
  const boundTab = tabsStore.tabs.find((tab) => tab.id === boundTabId);
  if (boundTab?.kind === "image") return;
  flushPendingCodeBlockEdits(view);
  tabsStore.syncContent(boundTabId, view.state.doc.toString());
}

function applyStoreToView(): void {
  if (!view || !boundTabId) return;
  const tab = tabsStore.tabs.find((t) => t.id === boundTabId);
  if (!tab) return;
  view.setState(
    createState(tab.kind === "image" ? "" : tab.content, tab.kind === "image" ? "" : tab.filePath),
  );
  fallbackContent.value = tab.content;
  refreshStatusStats(tab.content, tab.filePath);
  scheduleLanguageLoad(tab.filePath);
}

function navigateTo(target: { from: number; to: number }): void {
  if (!view) return;
  const len = view.state.doc.length;
  const from = Math.max(0, Math.min(target.from, len));
  const to = Math.max(from, Math.min(target.to, len));
  view.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: "center" }),
  });
  view.focus();
}

onMounted(() => {
  if (!containerRef.value) return;
  const tab = tabsStore.activeTab;
  const initialContent = tab?.content ?? "";
  const initialPath = tab?.filePath ?? "";
  const initialIsImage = tab?.kind === "image";
  boundTabId = tab?.id ?? null;
  try {
    view = new EditorView({
      state: createState(initialIsImage ? "" : initialContent, initialIsImage ? "" : initialPath),
      parent: containerRef.value,
    });
    setActiveEditorView(view);
    refreshStatusStats(initialIsImage ? "" : initialContent, initialIsImage ? "" : initialPath);
    if (!initialIsImage) scheduleLanguageLoad(initialPath);
    // 打开文件后立刻聚焦，避免 WebView 未聚焦时单击/双击无响应
    if (!initialIsImage) requestAnimationFrame(() => view?.focus());
    setActiveTabContentReader(() => {
      if (!view || !boundTabId) return null;
      const boundTab = tabsStore.tabs.find((tab) => tab.id === boundTabId);
      if (boundTab?.kind === "image") return null;
      flushPendingCodeBlockEdits(view);
      return { tabId: boundTabId, content: view.state.doc.toString() };
    });
    setApplyStoreContentToEditor(applyStoreToView);
    setEditorNavigateHandler(navigateTo);
    setEditorReplaceHandler(({ query, replacement, caseSensitive, replaceAll }) => {
      if (!view || !query) return null;
      const text = view.state.doc.toString();
      if (replaceAll) {
        const { ranges, count } = replaceAllInDoc(text, query, caseSensitive);
        if (count === 0) return { count: 0 };
        view.dispatch({
          changes: ranges.map((r) => ({ from: r.from, to: r.to, insert: replacement })),
        });
        return { count };
      }
      const sel = view.state.selection.main;
      const selected = text.slice(sel.from, sel.to);
      const selectionMatches = caseSensitive
        ? selected === query
        : selected.toLocaleLowerCase() === query.toLocaleLowerCase();
      const target = selectionMatches
        ? { from: sel.from, to: sel.to }
        : findNextInDoc(text, query, caseSensitive, sel.to);
      if (!target) return { count: 0 };
      view.dispatch({
        changes: { from: target.from, to: target.to, insert: replacement },
        selection: {
          anchor: target.from,
          head: target.from + replacement.length,
        },
        effects: EditorView.scrollIntoView(target.from, { y: "center" }),
      });
      return { count: 1 };
    });
  } catch (err) {
    console.error("[markmfy] EditorView mount failed", err);
    view = null;
    setActiveEditorView(null);
    renderError.value = err instanceof Error ? err.message : String(err);
    fallbackContent.value = initialContent;
  }
});

watch(
  () => tabsStore.activeTabId,
  (nextId) => {
    // 切 tab 前：view 仍是旧文档，先物化再换 state
    flushBoundTab();

    const nextTab = tabsStore.activeTab;
    const content = nextTab?.content ?? "";
    const filePath = nextTab?.filePath ?? "";
    const nextIsImage = nextTab?.kind === "image";
    boundTabId = nextId;

    if (view) {
      try {
        if (nextId == null) {
          view.setState(createState(""));
          clearEditorDocStats();
        } else if (nextIsImage) {
          view.setState(createState(""));
          clearEditorDocStats();
        } else {
          view.setState(createState(content, filePath));
          refreshStatusStats(content, filePath);
          scheduleLanguageLoad(filePath);
          requestAnimationFrame(() => view?.focus());
        }
        renderError.value = null;
        return;
      } catch (err) {
        console.error("[markmfy] EditorView setState failed", err);
        view.destroy();
        view = null;
        setActiveEditorView(null);
        setEditorNavigateHandler(null);
        setEditorReplaceHandler(null);
        renderError.value = err instanceof Error ? err.message : String(err);
      }
    }
    fallbackContent.value = content;
    refreshStatusStats(nextIsImage ? "" : content, nextIsImage ? "" : filePath);
  },
);

onBeforeUnmount(() => {
  languageLoadToken += 1;
  flushBoundTab();
  clearEditorDocStats();
  setActiveTabContentReader(null);
  setApplyStoreContentToEditor(null);
  setActiveEditorView(null);
  setEditorNavigateHandler(null);
  setEditorReplaceHandler(null);
  view?.destroy();
  view = null;
  boundTabId = null;
  languageCompartment = null;
});
</script>

<template>
  <div class="mm-editor-wrap">
    <div v-if="renderError" class="mm-editor-error">
      渲染出错，已回退为纯文本编辑模式：{{ renderError }}
    </div>
    <textarea
      v-if="renderError"
      class="mm-editor-fallback"
      :value="fallbackContent"
      @input="onFallbackInput"
    ></textarea>
    <ImageFileViewer
      v-if="isImageTab"
      :src="activeImageSrc"
      :file-name="tabsStore.activeTab?.fileName ?? ''"
    />
    <div v-show="!isImageTab && !renderError" ref="containerRef" class="mm-editor"></div>
  </div>
</template>

<style scoped>
.mm-editor-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--mm-color-editor, var(--mm-color-bg));
}

.mm-editor-error {
  flex: none;
  padding: 6px 12px;
  background: var(--mm-color-warning-soft);
  color: var(--mm-color-warning);
  font-size: 12px;
  border-bottom: 1px solid var(--mm-color-border);
}

.mm-editor-fallback {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 28px 44px 56px;
  font-family: var(--mm-editor-font-family);
  font-size: var(--mm-editor-font-size);
  line-height: var(--mm-editor-line-height);
  color: var(--mm-color-text);
  background: var(--mm-color-editor, var(--mm-color-bg));
}

.mm-editor {
  height: 100%;
  overflow: auto;
}

.mm-editor :deep(.cm-editor) {
  height: 100%;
  font-size: var(--mm-editor-font-size);
  outline: none;
  background: transparent;
  color: var(--mm-color-text);
}

.mm-editor :deep(.cm-scroller) {
  font-family: var(--mm-editor-font-family);
  line-height: var(--mm-editor-line-height);
}

.mm-editor :deep(.cm-content) {
  box-sizing: border-box;
  max-width: var(--mm-editor-content-width);
  min-height: 100%;
  margin: 0 auto;
  padding: 32px 48px 64px;
  caret-color: var(--mm-color-text);
  background: transparent;
}

.mm-editor :deep(.cm-line) {
  padding: 0;
}

.mm-editor :deep(.cm-activeLine) {
  background: color-mix(in srgb, var(--mm-color-hover) 55%, transparent);
}

.mm-editor :deep(.cm-selectionBackground),
.mm-editor :deep(.cm-content ::selection) {
  background: var(--mm-color-selection, var(--mm-color-accent-soft)) !important;
}

.mm-editor :deep(.cm-cursor) {
  border-left-color: var(--mm-color-accent);
}

.mm-editor :deep(.cm-gutters) {
  background: var(--mm-color-editor, var(--mm-color-bg-muted));
  color: var(--mm-color-text-tertiary, var(--mm-color-text-muted));
  border-right: 1px solid var(--mm-color-border);
}

.mm-editor :deep(.mm-code-block__editor .cm-editor) {
  height: auto;
  min-height: 0;
  color: var(--mm-code-text);
  caret-color: var(--mm-code-accent);
}

.mm-editor :deep(.mm-code-block__editor .cm-scroller) {
  overflow: visible;
}

.mm-editor :deep(.mm-code-block__editor .cm-content) {
  max-width: none;
  min-height: 0;
  margin: 0;
  padding: 14px 16px 18px 0;
  caret-color: var(--mm-code-accent);
}

.mm-editor :deep(.mm-code-block__editor .cm-gutters) {
  background: transparent;
  border-right: 0;
  color: var(--mm-code-muted);
}

.mm-editor :deep(.mm-code-block__editor .cm-line) {
  padding-left: 18px;
}

.mm-editor :deep(.mm-code-block__editor .cm-lineNumbers .cm-gutterElement) {
  min-width: 54px;
  padding: 0 16px 0 10px;
}

.mm-editor :deep(.mm-code-block__editor .cm-activeLine) {
  background: var(--mm-code-hover);
}

.mm-editor :deep(.mm-code-block__editor .cm-selectionBackground),
.mm-editor :deep(.mm-code-block__editor .cm-content ::selection) {
  background: color-mix(in srgb, var(--mm-code-accent) 35%, transparent) !important;
}

.mm-editor :deep(.mm-code-block__editor .cm-cursor) {
  border-left-color: var(--mm-code-accent);
}
</style>
