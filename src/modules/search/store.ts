import { defineStore } from "pinia";
import { normalizeInvokeError, searchWorkspace, type SearchHit } from "../../ipc";
import { findInText, type TextMatch } from "./textSearch";
import type { SearchMode } from "./types";

export const useSearchStore = defineStore("search", {
  state: () => ({
    open: false,
    mode: "file" as SearchMode,
    query: "",
    replacement: "",
    caseSensitive: false,
    loading: false,
    error: null as string | null,
    /** 当前文件匹配 */
    fileMatches: [] as TextMatch[],
    fileActiveIndex: 0,
    /** 工作区匹配 */
    workspaceHits: [] as SearchHit[],
  }),
  getters: {
    fileMatchCount(state): number {
      return state.fileMatches.length;
    },
    workspaceHitCount(state): number {
      return state.workspaceHits.length;
    },
  },
  actions: {
    openPanel(mode?: SearchMode): void {
      this.open = true;
      if (mode) this.mode = mode;
    },

    closePanel(): void {
      this.open = false;
    },

    setMode(mode: SearchMode): void {
      this.mode = mode;
    },

    clearResults(): void {
      this.fileMatches = [];
      this.fileActiveIndex = 0;
      this.workspaceHits = [];
      this.error = null;
    },

    searchInFile(content: string): void {
      this.error = null;
      this.fileMatches = findInText(content, this.query, this.caseSensitive);
      this.fileActiveIndex = this.fileMatches.length > 0 ? 0 : -1;
    },

    nextFileMatch(): TextMatch | null {
      if (this.fileMatches.length === 0) return null;
      this.fileActiveIndex = (this.fileActiveIndex + 1) % this.fileMatches.length;
      return this.fileMatches[this.fileActiveIndex] ?? null;
    },

    prevFileMatch(): TextMatch | null {
      if (this.fileMatches.length === 0) return null;
      this.fileActiveIndex =
        (this.fileActiveIndex - 1 + this.fileMatches.length) % this.fileMatches.length;
      return this.fileMatches[this.fileActiveIndex] ?? null;
    },

    currentFileMatch(): TextMatch | null {
      if (this.fileActiveIndex < 0) return null;
      return this.fileMatches[this.fileActiveIndex] ?? null;
    },

    async searchInWorkspace(rootPath: string | null): Promise<void> {
      this.error = null;
      this.workspaceHits = [];
      if (!rootPath) {
        this.error = "请先打开工作区文件夹";
        return;
      }
      const q = this.query.trim();
      if (!q) {
        return;
      }
      this.loading = true;
      try {
        this.workspaceHits = await searchWorkspace({
          rootPath,
          query: q,
          caseSensitive: this.caseSensitive,
          maxResults: 500,
        });
      } catch (err) {
        this.error = normalizeInvokeError(err, "工作区搜索失败");
      } finally {
        this.loading = false;
      }
    },
  },
});
