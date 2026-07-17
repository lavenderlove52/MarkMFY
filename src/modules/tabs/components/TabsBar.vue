<script setup lang="ts">
import { ref } from "vue";
import { useTabsStore } from "../store";
import UnsavedChangesDialog from "./UnsavedChangesDialog.vue";

const tabsStore = useTabsStore();
const pendingCloseTabId = ref<string | null>(null);

function activate(tabId: string): void {
  tabsStore.setActive(tabId);
}

function requestClose(tabId: string): void {
  // 关闭活跃 tab 前先物化，避免仅有 isDirty 标记却无全文
  if (tabId === tabsStore.activeTabId) {
    tabsStore.materializeActiveContent();
  }
  const tab = tabsStore.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (tab.isDirty) {
    pendingCloseTabId.value = tabId;
  } else {
    tabsStore.closeTab(tabId);
  }
}

async function onDialogSave(): Promise<void> {
  if (!pendingCloseTabId.value) return;
  await tabsStore.saveTab(pendingCloseTabId.value);
  tabsStore.closeTab(pendingCloseTabId.value);
  pendingCloseTabId.value = null;
}

function onDialogDiscard(): void {
  if (!pendingCloseTabId.value) return;
  tabsStore.closeTab(pendingCloseTabId.value);
  pendingCloseTabId.value = null;
}

function onDialogCancel(): void {
  pendingCloseTabId.value = null;
}
</script>

<template>
  <div class="tabs-bar">
    <div
      v-for="tab in tabsStore.tabs"
      :key="tab.id"
      class="tabs-bar__tab"
      :class="{ 'tabs-bar__tab--active': tab.id === tabsStore.activeTabId }"
      @click="activate(tab.id)"
    >
      <span class="tabs-bar__name">{{ tab.fileName }}</span>
      <span v-if="tab.isDirty" class="tabs-bar__dirty-dot">●</span>
      <button
        type="button"
        class="tabs-bar__close"
        title="关闭"
        @click.stop="requestClose(tab.id)"
      >
        ×
      </button>
    </div>

    <UnsavedChangesDialog
      v-if="pendingCloseTabId"
      :file-name="tabsStore.tabs.find((t) => t.id === pendingCloseTabId)?.fileName ?? ''"
      @save="onDialogSave"
      @discard="onDialogDiscard"
      @cancel="onDialogCancel"
    />
  </div>
</template>

<style scoped>
.tabs-bar {
  display: flex;
  overflow-x: auto;
  gap: 2px;
  padding: 6px 10px 0;
  border-bottom: 1px solid var(--mm-color-border);
  background: var(--mm-color-editor, var(--mm-color-bg));
}

.tabs-bar__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 7px 10px 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: var(--mm-radius-sm) var(--mm-radius-sm) 0 0;
  white-space: nowrap;
  color: var(--mm-color-text-muted);
  transition:
    background var(--mm-duration-fast, 120ms) var(--mm-ease-standard, ease-out),
    color var(--mm-duration-fast, 120ms) var(--mm-ease-standard, ease-out);
}

.tabs-bar__tab:hover {
  background: var(--mm-color-hover);
  color: var(--mm-color-text);
}

.tabs-bar__tab--active {
  border-color: transparent;
  border-bottom-color: var(--mm-color-accent);
  background: transparent;
  color: var(--mm-color-text);
  font-weight: 600;
}

.tabs-bar__name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tabs-bar__dirty-dot {
  color: var(--mm-color-accent);
  font-size: 9px;
  opacity: 0.85;
}

.tabs-bar__close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: inherit;
  opacity: 0;
  border-radius: var(--mm-radius-sm);
  padding: 0 2px;
}

.tabs-bar__tab:hover .tabs-bar__close,
.tabs-bar__tab--active .tabs-bar__close {
  opacity: 0.55;
}

.tabs-bar__close:hover {
  opacity: 1 !important;
  color: var(--mm-color-danger);
  background: var(--mm-color-danger-soft);
}
</style>
