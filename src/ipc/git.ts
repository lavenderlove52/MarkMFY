/**
 * Git 相关 Tauri command 的统一封装层。
 */
import { invoke } from "@tauri-apps/api/core";

export interface GitFileStatus {
  path: string;
  staged: boolean;
  kind: "new" | "modified" | "deleted" | "renamed" | "typechange" | "conflicted";
}

export interface GitStatusResult {
  isRepo: boolean;
  files: GitFileStatus[];
  /** 合并 / cherry-pick / revert 进行中 */
  mergeInProgress: boolean;
}

export interface DiffLine {
  origin: string;
  content: string;
  oldLineno?: number;
  newLineno?: number;
}

export interface CommitInfo {
  hash: string;
  author: string;
  time: number;
  message: string;
}

export interface BranchInfo {
  name: string;
  isHead: boolean;
}

export function gitStatus(workspacePath: string): Promise<GitStatusResult> {
  return invoke<GitStatusResult>("git_status", { workspacePath });
}

export function gitDiff(
  workspacePath: string,
  filePath: string,
  staged: boolean,
): Promise<DiffLine[]> {
  return invoke<DiffLine[]>("git_diff", { workspacePath, filePath, staged });
}

export function gitStage(workspacePath: string, filePath: string): Promise<void> {
  return invoke<void>("git_stage", { workspacePath, filePath });
}

export function gitUnstage(workspacePath: string, filePath: string): Promise<void> {
  return invoke<void>("git_unstage", { workspacePath, filePath });
}

export function gitCommit(workspacePath: string, message: string): Promise<string> {
  return invoke<string>("git_commit", { workspacePath, message });
}

export function gitLog(workspacePath: string, limit = 50): Promise<CommitInfo[]> {
  return invoke<CommitInfo[]>("git_log", { workspacePath, limit });
}

export function gitCommitDiff(
  workspacePath: string,
  commitHash: string,
): Promise<DiffLine[]> {
  return invoke<DiffLine[]>("git_commit_diff", { workspacePath, commitHash });
}

export function gitBranches(workspacePath: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("git_branches", { workspacePath });
}

export function gitCheckout(workspacePath: string, branchName: string): Promise<void> {
  return invoke<void>("git_checkout", { workspacePath, branchName });
}
