import type { BranchInfo, CommitInfo, DiffLine, GitFileStatus } from "../../ipc";

export type { BranchInfo, CommitInfo, DiffLine, GitFileStatus };

export type GitPanelTab = "changes" | "history";

export interface SelectedDiffTarget {
  /** 工作区相对路径，或 commit hash（历史模式下） */
  path: string;
  staged: boolean;
  mode: "file" | "commit";
}
