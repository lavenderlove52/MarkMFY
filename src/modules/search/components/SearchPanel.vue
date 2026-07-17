<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { navigateEditorSelection, replaceInActiveEditor } from "../../editor";
import { useWorkspaceStore } from "../../filesystem";
import { readActiveTabContent, useTabsStore } from "../../tabs";
import { showToast } from "../../../notify";
import { findInText } from "../textSearch";
import { useSearchStore } from "../store";
import type { SearchHit } from "../types";

const search = useSearchStore();
const tabsStore = useTabsStore();
const workspaceStore = useWorkspaceStore();
const queryInput = ref<HTMLInputElement | null>(null);

const statusText = computed(() => {
  if (search.mode === "file") {
    if (!search.query.trim()) return "输入关键字后查找";
    if (search.fileMatchCount === 0) return "无匹配";
    return `${search.fileActiveIndex + 1} / ${search.fileMatchCount}`;
  }
  if (search.loading) return "搜索中…";
  if (search.error) return search.error;
  if (!search.query.trim()) return "输入关键字后搜索工作区";
  return `${search.workspaceHitCount} 处匹配`;
});

watch(
  () => search.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    queryInput.value?.focus();
    queryInput.value?.select();
  },
);

function getActiveContent(): string {
  const live = readActiveTabContent();
  if (live) return live.content;
  tabsStore.materializeActiveContent();
  return tabsStore.activeTab?.content ?? "";
}

function runFileSearch(): void {
  search.searchInFile(getActiveContent());
  const cur = search.currentFileMatch();
  if (cur) navigateEditorSelection({ from: cur.from, to: cur.to });
}

async function runSearch(): Promise<void> {
  if (search.mode === "file") {
    runFileSearch();
    return;
  }
  await search.searchInWorkspace(workspaceStore.rootPath);
}

function onFindNext(): void {
  if (search.mode !== "file") return;
  if (search.fileMatchCount === 0) {
    runFileSearch();
    return;
  }
  const cur = search.nextFileMatch();
  if (cur) navigateEditorSelection({ from: cur.from, to: cur.to });
}

function onFindPrev(): void {
  if (search.mode !== "file") return;
  if (search.fileMatchCount === 0) {
    runFileSearch();
    return;
  }
  const cur = search.prevFileMatch();
  if (cur) navigateEditorSelection({ from: cur.from, to: cur.to });
}

function onReplaceOne(): void {
  if (search.mode !== "file" || !search.query) return;
  const result = replaceInActiveEditor({
    query: search.query,
    replacement: search.replacement,
    caseSensitive: search.caseSensitive,
    replaceAll: false,
  });
  if (result && result.count > 0) {
    runFileSearch();
  }
}

function onReplaceAll(): void {
  if (search.mode !== "file" || !search.query) return;
  replaceInActiveEditor({
    query: search.query,
    replacement: search.replacement,
    caseSensitive: search.caseSensitive,
    replaceAll: true,
  });
  runFileSearch();
}

async function jumpToHit(hit: SearchHit): Promise<void> {
  await tabsStore.openFile(hit.path);
  await nextTick();
  if (tabsStore.activeTab?.filePath !== hit.path) {
    return;
  }

  let from = hit.from;
  let to = hit.to;
  const tab = tabsStore.activeTab;
  if (tab.isDirty) {
    const content = getActiveContent();
    const matches = findInText(content, search.query.trim(), search.caseSensitive);
    const prefer =
      matches.find((m) => m.from === hit.from && m.to === hit.to) ??
      matches.find((m) => m.line === hit.line) ??
      matches[0];
    if (!prefer) {
      showToast("该文件有未保存修改，未能按当前内容定位到匹配", "info");
      return;
    }
    from = prefer.from;
    to = prefer.to;
  }

  requestAnimationFrame(() => {
    if (tabsStore.activeTab?.filePath !== hit.path) return;
    navigateEditorSelection({ from, to });
  });
}

function onQueryKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey && search.mode === "file") {
      onFindPrev();
    } else if (search.mode === "file") {
      onFindNext();
    } else {
      void runSearch();
    }
  } else if (e.key === "Escape") {
    search.closePanel();
  }
}
</script>

<template>
  <aside v-if="search.open" class="mm-search">
    <header class="mm-search__header">
      <div class="mm-search__tabs">
        <button
          type="button"
          class="mm-search__tab"
          :class="{ 'mm-search__tab--active': search.mode === 'file' }"
          @click="search.setMode('file')"
        >
          当前文件
        </button>
        <button
          type="button"
          class="mm-search__tab"
          :class="{ 'mm-search__tab--active': search.mode === 'workspace' }"
          @click="search.setMode('workspace')"
        >
          工作区
        </button>
      </div>
      <button type="button" class="mm-search__close" title="关闭" @click="search.closePanel()">
        ×
      </button>
    </header>

    <div class="mm-search__form">
      <input
        ref="queryInput"
        v-model="search.query"
        class="mm-search__input"
        type="text"
        placeholder="查找…"
        @keydown="onQueryKeydown"
      />
      <input
        v-if="search.mode === 'file'"
        v-model="search.replacement"
        class="mm-search__input"
        type="text"
        placeholder="替换为…"
        @keydown.enter.prevent="onReplaceOne"
      />
      <label class="mm-search__check">
        <input v-model="search.caseSensitive" type="checkbox" />
        区分大小写
      </label>
      <div class="mm-search__actions">
        <button type="button" class="mm-search__btn" @click="runSearch">查找</button>
        <template v-if="search.mode === 'file'">
          <button type="button" class="mm-search__btn" @click="onFindPrev">上一个</button>
          <button type="button" class="mm-search__btn" @click="onFindNext">下一个</button>
          <button type="button" class="mm-search__btn" @click="onReplaceOne">替换</button>
          <button type="button" class="mm-search__btn" @click="onReplaceAll">全部替换</button>
        </template>
      </div>
      <p class="mm-search__status">{{ statusText }}</p>
    </div>

    <ul v-if="search.mode === 'workspace'" class="mm-search__results">
      <li v-if="!search.loading && search.workspaceHits.length === 0 && search.query.trim()" class="mm-search__empty">
        无匹配结果
      </li>
      <li
        v-for="(hit, index) in search.workspaceHits"
        :key="`${hit.path}-${hit.from}-${index}`"
        class="mm-search__hit"
        @click="jumpToHit(hit)"
      >
        <div class="mm-search__hit-path">{{ hit.path }}:{{ hit.line }}</div>
        <div class="mm-search__hit-preview">{{ hit.preview }}</div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.mm-search {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--mm-color-border);
  background: var(--mm-color-panel);
  color: var(--mm-color-text);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mm-search__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--mm-color-border);
  background: var(--mm-color-bg-muted);
}

.mm-search__tabs {
  display: flex;
  gap: 4px;
  flex: 1;
}

.mm-search__tab {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  border-radius: var(--mm-radius-sm);
  padding: 5px 9px;
  font-size: 12px;
  cursor: pointer;
}

.mm-search__tab--active {
  border-color: var(--mm-color-border);
  background: var(--mm-color-surface);
  color: var(--mm-color-accent);
  font-weight: 600;
}

.mm-search__close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.mm-search__form {
  padding: 10px;
  border-bottom: 1px solid var(--mm-color-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mm-search__input {
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: inherit;
  border-radius: var(--mm-radius-sm);
  padding: 7px 9px;
  font-size: 13px;
  outline: none;
}

.mm-search__input:focus {
  border-color: var(--mm-color-accent);
  box-shadow: 0 0 0 3px var(--mm-color-accent-soft);
}

.mm-search__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mm-color-text-muted);
}

.mm-search__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mm-search__btn {
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: inherit;
  border-radius: var(--mm-radius-sm);
  padding: 4px 9px;
  font-size: 12px;
  cursor: pointer;
}

.mm-search__btn:hover {
  border-color: var(--mm-color-accent);
  background: var(--mm-color-hover);
}

.mm-search__status {
  margin: 0;
  font-size: 11px;
  color: var(--mm-color-text-muted);
}

.mm-search__results {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow: auto;
  flex: 1;
}

.mm-search__empty {
  padding: 12px;
  font-size: 12px;
  color: var(--mm-color-text-muted);
}

.mm-search__hit {
  padding: 7px 9px;
  border-radius: var(--mm-radius-sm);
  cursor: pointer;
}

.mm-search__hit:hover {
  background: var(--mm-color-hover);
}

.mm-search__hit-path {
  font-size: 11px;
  color: var(--mm-color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mm-search__hit-preview {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
