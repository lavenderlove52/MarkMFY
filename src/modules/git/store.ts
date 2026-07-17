import { defineStore } from "pinia";
import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitCommitDiff,
  gitDiff,
  gitLog,
  gitStage,
  gitStatus,
  gitUnstage,
  normalizeInvokeError,
  type BranchInfo,
  type CommitInfo,
  type DiffLine,
  type GitFileStatus,
} from "../../ipc";
import { toastError } from "../../notify";
import type { GitPanelTab, SelectedDiffTarget } from "./types";

export const useGitStore = defineStore("git", {
  state: () => ({
    isRepo: false,
    files: [] as GitFileStatus[],
    mergeInProgress: false,
    branches: [] as BranchInfo[],
    commits: [] as CommitInfo[],
    diffLines: [] as DiffLine[],
    selected: null as SelectedDiffTarget | null,
    activeTab: "changes" as GitPanelTab,
    commitMessage: "",
    loading: false,
    error: null as string | null,
  }),
  getters: {
    stagedFiles(state): GitFileStatus[] {
      return state.files.filter((f) => f.staged && f.kind !== "conflicted");
    },
    unstagedFiles(state): GitFileStatus[] {
      return state.files.filter((f) => !f.staged && f.kind !== "conflicted");
    },
    conflictedFiles(state): GitFileStatus[] {
      return state.files.filter((f) => f.kind === "conflicted");
    },
    hasMergeConflicts(state): boolean {
      return state.mergeInProgress || state.files.some((f) => f.kind === "conflicted");
    },
    currentBranch(state): string | null {
      return state.branches.find((b) => b.isHead)?.name ?? null;
    },
  },
  actions: {
    async refresh(workspacePath: string | null): Promise<void> {
      if (!workspacePath) {
        this.isRepo = false;
        this.files = [];
        this.mergeInProgress = false;
        this.branches = [];
        this.commits = [];
        this.diffLines = [];
        this.selected = null;
        this.error = null;
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        const status = await gitStatus(workspacePath);
        this.isRepo = status.isRepo;
        this.files = status.files;
        this.mergeInProgress = status.mergeInProgress ?? false;
        if (!status.isRepo) {
          this.branches = [];
          this.commits = [];
          this.diffLines = [];
          this.selected = null;
          this.mergeInProgress = false;
          return;
        }
        const [branches, commits] = await Promise.all([
          gitBranches(workspacePath),
          gitLog(workspacePath, 50),
        ]);
        this.branches = branches;
        this.commits = commits;
      } catch (e) {
        this.error = normalizeInvokeError(e, "刷新 Git 状态失败");
        toastError(this.error);
      } finally {
        this.loading = false;
      }
    },

    async selectFile(workspacePath: string, file: GitFileStatus): Promise<void> {
      this.selected = { path: file.path, staged: file.staged, mode: "file" };
      try {
        this.diffLines = await gitDiff(workspacePath, file.path, file.staged);
        this.error = null;
      } catch (e) {
        this.diffLines = [];
        this.error = normalizeInvokeError(e, "读取 diff 失败");
        toastError(this.error);
      }
    },

    async selectCommit(workspacePath: string, commit: CommitInfo): Promise<void> {
      this.selected = { path: commit.hash, staged: false, mode: "commit" };
      try {
        this.diffLines = await gitCommitDiff(workspacePath, commit.hash);
        this.error = null;
      } catch (e) {
        this.diffLines = [];
        this.error = normalizeInvokeError(e, "读取提交 diff 失败");
        toastError(this.error);
      }
    },

    async stage(workspacePath: string, relativePath: string): Promise<void> {
      try {
        await gitStage(workspacePath, relativePath);
        await this.refresh(workspacePath);
      } catch (e) {
        this.error = normalizeInvokeError(e, "暂存失败");
        toastError(this.error);
      }
    },

    async unstage(workspacePath: string, relativePath: string): Promise<void> {
      try {
        await gitUnstage(workspacePath, relativePath);
        await this.refresh(workspacePath);
      } catch (e) {
        this.error = normalizeInvokeError(e, "取消暂存失败");
        toastError(this.error);
      }
    },

    async commit(workspacePath: string): Promise<void> {
      const message = this.commitMessage.trim();
      if (!message) return;
      if (this.hasMergeConflicts) {
        this.error = "存在未解决的合并冲突，请先解决后再提交";
        toastError(this.error);
        return;
      }
      try {
        await gitCommit(workspacePath, message);
        this.commitMessage = "";
        this.diffLines = [];
        this.selected = null;
        await this.refresh(workspacePath);
      } catch (e) {
        this.error = normalizeInvokeError(e, "提交失败");
        toastError(this.error);
      }
    },

    async checkout(workspacePath: string, branchName: string): Promise<void> {
      try {
        await gitCheckout(workspacePath, branchName);
        await this.refresh(workspacePath);
      } catch (e) {
        this.error = normalizeInvokeError(e, "切换分支失败");
        toastError(this.error);
      }
    },

    setActiveTab(tab: GitPanelTab): void {
      this.activeTab = tab;
      this.diffLines = [];
      this.selected = null;
    },
  },
});
