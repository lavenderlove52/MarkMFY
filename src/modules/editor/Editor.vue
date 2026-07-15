<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import { setActiveTabContentReader, setApplyStoreContentToEditor, useTabsStore } from "../tabs";
import { savePastedImage } from "../../ipc";
import { createMarkdownExtensions } from "./core/setup";
import { dirName, joinPath } from "./core/paths";

const tabsStore = useTabsStore();
const containerRef = ref<HTMLDivElement | null>(null);
const renderError = ref<string | null>(null);
const fallbackContent = ref("");
let view: EditorView | null = null;
/** 当前 view 对应的 tabId（切 tab 时先物化旧文档用）。 */
let boundTabId: string | null = null;

function resolveImageSrc(rawPath: string): string {
  if (/^[a-z]+:\/\//i.test(rawPath) || rawPath.startsWith("data:")) {
    return rawPath;
  }
  const tab = tabsStore.activeTab;
  if (!tab) return rawPath;
  const absolutePath = joinPath(dirName(tab.filePath), rawPath);
  return convertFileSrc(absolutePath);
}

function onDirty(): void {
  const tab = tabsStore.activeTab;
  if (!tab) return;
  tabsStore.markDirty(tab.id);
}

async function onSave(): Promise<void> {
  const tab = tabsStore.activeTab;
  if (!tab) return;
  await tabsStore.saveTab(tab.id);
}

async function onPasteImage(file: File): Promise<void> {
  const tab = tabsStore.activeTab;
  if (!tab || !view) return;
  const buffer = await file.arrayBuffer();
  const ext = file.type.split("/")[1] ?? "png";
  const fileName = `pasted-${Date.now()}.${ext}`;
  const relativePath = await savePastedImage(tab.filePath, fileName, new Uint8Array(buffer));
  const pos = view.state.selection.main.from;
  view.dispatch({ changes: { from: pos, insert: `![](${relativePath})` } });
}

function createState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: createMarkdownExtensions({
      onDirty,
      onSave: () => void onSave(),
      resolveImageSrc,
      onPasteImage: (file) => void onPasteImage(file),
    }),
  });
}

function onFallbackInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  fallbackContent.value = value;
  const tab = tabsStore.activeTab;
  if (!tab) return;
  tabsStore.syncContent(tab.id, value);
}

function flushBoundTab(): void {
  if (!view || !boundTabId) return;
  tabsStore.syncContent(boundTabId, view.state.doc.toString());
}

function applyStoreToView(): void {
  if (!view || !boundTabId) return;
  const tab = tabsStore.tabs.find((t) => t.id === boundTabId);
  if (!tab) return;
  view.setState(createState(tab.content));
  fallbackContent.value = tab.content;
}

onMounted(() => {
  if (!containerRef.value) return;
  const tab = tabsStore.activeTab;
  const initialContent = tab?.content ?? "";
  boundTabId = tab?.id ?? null;
  try {
    view = new EditorView({
      state: createState(initialContent),
      parent: containerRef.value,
    });
    setActiveTabContentReader(() => {
      if (!view || !boundTabId) return null;
      return { tabId: boundTabId, content: view.state.doc.toString() };
    });
    setApplyStoreContentToEditor(applyStoreToView);
  } catch (err) {
    console.error("[markmfy] EditorView mount failed", err);
    view = null;
    renderError.value = err instanceof Error ? err.message : String(err);
    fallbackContent.value = initialContent;
  }
});

watch(
  () => tabsStore.activeTabId,
  (nextId) => {
    // 切 tab 前：view 仍是旧文档，先物化再换 state
    flushBoundTab();

    const content = tabsStore.activeTab?.content ?? "";
    boundTabId = nextId;

    if (view) {
      try {
        if (nextId == null) {
          view.setState(createState(""));
        } else {
          view.setState(createState(content));
        }
        renderError.value = null;
        return;
      } catch (err) {
        console.error("[markmfy] EditorView setState failed", err);
        view.destroy();
        view = null;
        renderError.value = err instanceof Error ? err.message : String(err);
      }
    }
    fallbackContent.value = content;
  },
);

onBeforeUnmount(() => {
  flushBoundTab();
  setActiveTabContentReader(null);
  setApplyStoreContentToEditor(null);
  view?.destroy();
  view = null;
  boundTabId = null;
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
    <div v-show="!renderError" ref="containerRef" class="mm-editor"></div>
  </div>
</template>

<style scoped>
.mm-editor-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mm-editor-error {
  flex: none;
  padding: 6px 12px;
  background: #fff3cd;
  color: #664d03;
  font-size: 12px;
  border-bottom: 1px solid #ffe69c;
}

.mm-editor-fallback {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px 24px;
  font-family: var(--mm-editor-font-family);
  font-size: var(--mm-editor-font-size);
  line-height: 1.6;
  color: var(--mm-color-text);
  background: var(--mm-color-bg);
}

.mm-editor {
  height: 100%;
  overflow: auto;
}

.mm-editor :deep(.cm-editor) {
  height: 100%;
  font-size: var(--mm-editor-font-size);
  outline: none;
  background: var(--mm-color-bg);
  color: var(--mm-color-text);
}

.mm-editor :deep(.cm-scroller) {
  font-family: var(--mm-editor-font-family);
  line-height: 1.6;
}

.mm-editor :deep(.cm-content) {
  padding: 16px 24px;
  caret-color: var(--mm-color-text);
}

.mm-editor :deep(.cm-cursor) {
  border-left-color: var(--mm-color-text);
}

.mm-editor :deep(.cm-gutters) {
  background: var(--mm-color-bg-muted);
  color: var(--mm-color-text-muted);
  border-right: 1px solid var(--mm-color-border);
}
</style>
