import { defineStore } from "pinia";
import { readFile, writeFile } from "../../ipc";
import { showToast, toastError } from "../../notify";
import { readActiveTabContent } from "./contentBridge";
import type { TabItem } from "./types";

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [] as TabItem[],
    activeTabId: null as string | null,
  }),
  getters: {
    activeTab(state): TabItem | undefined {
      return state.tabs.find((t) => t.id === state.activeTabId);
    },
    dirtyTabs(state): TabItem[] {
      return state.tabs.filter((t) => t.isDirty);
    },
  },
  actions: {
    /** 打开文件为一个新 tab；如果已经打开，则只是切换到该 tab。 */
    async openFile(filePath: string): Promise<void> {
      const existing = this.tabs.find((t) => t.filePath === filePath);
      if (existing) {
        this.activeTabId = existing.id;
        return;
      }
      try {
        const content = await readFile(filePath);
        const tab: TabItem = {
          id: filePath,
          filePath,
          fileName: fileNameFromPath(filePath),
          content,
          originalContent: content,
          isDirty: false,
        };
        this.tabs.push(tab);
        this.activeTabId = tab.id;
      } catch (err) {
        toastError(err, "打开文件失败");
      }
    },

    setActive(tabId: string): void {
      this.activeTabId = tabId;
    },

    /** 仅标记未保存，不复制全文（输入路径用）。 */
    markDirty(tabId: string): void {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab || tab.isDirty) return;
      tab.isDirty = true;
    },

    /**
     * 把完整内容写回 store（保存 / 切 tab / 关 tab 前调用）。
     * isDirty 仍按与 originalContent 比较决定。
     */
    syncContent(tabId: string, content: string): void {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      tab.content = content;
      tab.isDirty = content !== tab.originalContent;
    },

    /** 若活跃 tab 有编辑器绑定，把其文档物化进 store。 */
    materializeActiveContent(): void {
      const snapshot = readActiveTabContent();
      if (!snapshot) return;
      if (this.activeTabId && snapshot.tabId !== this.activeTabId) return;
      this.syncContent(snapshot.tabId, snapshot.content);
    },

    /** @deprecated 请优先用 markDirty + materialize；保留兼容旧调用。 */
    updateContent(tabId: string, content: string): void {
      this.syncContent(tabId, content);
    },

    async saveTab(tabId: string): Promise<void> {
      if (tabId === this.activeTabId) {
        this.materializeActiveContent();
      }
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      try {
        await writeFile(tab.filePath, tab.content);
        tab.originalContent = tab.content;
        tab.isDirty = false;
        showToast("已保存", "success", 2000);
      } catch (err) {
        toastError(err, "保存失败");
      }
    },

    /** 放弃未保存修改，恢复为打开时 / 上次保存内容。 */
    discardChanges(tabId: string): void {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      tab.content = tab.originalContent;
      tab.isDirty = false;
    },

    /** 直接关闭 tab，不做未保存检查（未保存确认由 UI 层负责）。 */
    closeTab(tabId: string): void {
      const index = this.tabs.findIndex((t) => t.id === tabId);
      if (index === -1) return;
      this.tabs.splice(index, 1);
      if (this.activeTabId === tabId) {
        const fallback = this.tabs[index] ?? this.tabs[index - 1];
        this.activeTabId = fallback ? fallback.id : null;
      }
    },

    /** 关闭全部 tab（切分支后刷新用）；调用前应已处理完 dirty。 */
    closeAllTabs(): void {
      this.tabs = [];
      this.activeTabId = null;
    },
  },
});
