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
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--mm-color-bg, #fff);
}

.tabs-bar__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}

.tabs-bar__tab--active {
  background: var(--mm-color-active, rgba(0, 0, 0, 0.06));
}

.tabs-bar__dirty-dot {
  color: #396cd8;
  font-size: 10px;
}

.tabs-bar__close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: inherit;
  opacity: 0.6;
}

.tabs-bar__close:hover {
  opacity: 1;
}
</style>
