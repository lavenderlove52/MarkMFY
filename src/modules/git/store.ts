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
  type BranchInfo,
  type CommitInfo,
  type DiffLine,
  type GitFileStatus,
} from "../../ipc";
import type { GitPanelTab, SelectedDiffTarget } from "./types";

export const useGitStore = defineStore("git", {
  state: () => ({
    isRepo: false,
    files: [] as GitFileStatus[],
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
      return state.files.filter((f) => f.staged);
    },
    unstagedFiles(state): GitFileStatus[] {
      return state.files.filter((f) => !f.staged);
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
        this.branches = [];
        this.commits = [];
        this.diffLines = [];
        this.selected = null;
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        const status = await gitStatus(workspacePath);
        this.isRepo = status.isRepo;
        this.files = status.files;
        if (!status.isRepo) {
          this.branches = [];
          this.commits = [];
          this.diffLines = [];
          this.selected = null;
          return;
        }
        const [branches, commits] = await Promise.all([
          gitBranches(workspacePath),
          gitLog(workspacePath, 50),
        ]);
        this.branches = branches;
        this.commits = commits;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.loading = false;
      }
    },

    async selectFile(workspacePath: string, file: GitFileStatus): Promise<void> {
      this.selected = { path: file.path, staged: file.staged, mode: "file" };
      this.diffLines = await gitDiff(workspacePath, file.path, file.staged);
    },

    async selectCommit(workspacePath: string, commit: CommitInfo): Promise<void> {
      this.selected = { path: commit.hash, staged: false, mode: "commit" };
      this.diffLines = await gitCommitDiff(workspacePath, commit.hash);
    },

    async stage(workspacePath: string, relativePath: string): Promise<void> {
      await gitStage(workspacePath, relativePath);
      await this.refresh(workspacePath);
    },

    async unstage(workspacePath: string, relativePath: string): Promise<void> {
      await gitUnstage(workspacePath, relativePath);
      await this.refresh(workspacePath);
    },

    async commit(workspacePath: string): Promise<void> {
      const message = this.commitMessage.trim();
      if (!message) return;
      await gitCommit(workspacePath, message);
      this.commitMessage = "";
      this.diffLines = [];
      this.selected = null;
      await this.refresh(workspacePath);
    },

    async checkout(workspacePath: string, branchName: string): Promise<void> {
      await gitCheckout(workspacePath, branchName);
      await this.refresh(workspacePath);
    },

    setActiveTab(tab: GitPanelTab): void {
      this.activeTab = tab;
      this.diffLines = [];
      this.selected = null;
    },
  },
});
