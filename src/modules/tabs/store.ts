import { defineStore } from "pinia";
import { getFileMtime, readFile, writeFile } from "../../ipc";
import { showToast, toastError } from "../../notify";
import { applyStoreContentToActiveEditor, readActiveTabContent } from "./contentBridge";
import type { ExternalChangeConflict, TabItem } from "./types";

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [] as TabItem[],
    activeTabId: null as string | null,
    /** 当前等待用户处理的外部修改冲突（同一时间只展示一个，见 checkExternalChanges）。 */
    externalConflict: null as ExternalChangeConflict | null,
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
        // mtime 查询失败不影响正常打开，只是放弃这份文件的外部修改检测（diskMtimeMs 留 null）。
        const diskMtimeMs = await getFileMtime(filePath).catch(() => null);
        const tab: TabItem = {
          id: filePath,
          filePath,
          fileName: fileNameFromPath(filePath),
          content,
          originalContent: content,
          isDirty: false,
          diskMtimeMs,
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
        tab.diskMtimeMs = await getFileMtime(tab.filePath).catch(() => tab.diskMtimeMs);
        showToast("已保存", "success", 2000);
      } catch (err) {
        toastError(err, "保存失败");
      }
    },

    /**
     * 检查所有已打开 tab 对应的文件是否被其它程序修改过（磁盘 mtime 与最近一次
     * 打开/保存时记录的不一致）。命中时把冲突信息写入 `externalConflict`，由
     * `ExternalChangeDialog` 展示给用户选择"保存已经打开的"还是"加载外部修改后的"；
     * 不会自动覆盖任何一侧内容。已有冲突等待处理时不重复检测。
     * 调用时机：窗口重新获得焦点（App.vue），覆盖"切到别的程序改完文件再切回来"这个最常见场景。
     */
    async checkExternalChanges(): Promise<void> {
      if (this.externalConflict) return;
      for (const tab of this.tabs) {
        if (tab.diskMtimeMs === null) continue;
        let diskMtimeMs: number | null;
        try {
          diskMtimeMs = await getFileMtime(tab.filePath);
        } catch {
          continue; // 检测失败不打断正常使用，下次窗口聚焦再试
        }
        if (diskMtimeMs === null || diskMtimeMs === tab.diskMtimeMs) continue;
        this.externalConflict = { tabId: tab.id, fileName: tab.fileName, hasLocalEdits: tab.isDirty };
        return; // 一次只弹一个，处理完后由调用方决定是否继续检查下一个
      }
    },

    /** 冲突弹窗「保存已经打开的」：用编辑器当前内容覆盖磁盘上的外部修改。 */
    async keepCurrentOverDisk(tabId: string): Promise<void> {
      if (tabId === this.activeTabId) {
        this.materializeActiveContent();
      }
      this.externalConflict = null;
      await this.saveTab(tabId);
      await this.checkExternalChanges(); // 一次窗口聚焦可能有多个 tab 冲突，处理完一个接着看下一个
    },

    /** 冲突弹窗「加载外部修改后的」：放弃编辑器当前内容，重新从磁盘读取。 */
    async loadDiskVersion(tabId: string): Promise<void> {
      this.externalConflict = null;
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      try {
        const content = await readFile(tab.filePath);
        tab.content = content;
        tab.originalContent = content;
        tab.isDirty = false;
        tab.diskMtimeMs = await getFileMtime(tab.filePath).catch(() => tab.diskMtimeMs);
        if (tabId === this.activeTabId) {
          applyStoreContentToActiveEditor();
        }
      } catch (err) {
        toastError(err, "重新加载失败");
      }
      await this.checkExternalChanges(); // 一次窗口聚焦可能有多个 tab 冲突，处理完一个接着看下一个
    },

    /** 冲突弹窗「暂不处理」：先关闭弹窗，下次窗口聚焦时会重新检测。 */
    dismissExternalConflict(): void {
      this.externalConflict = null;
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
