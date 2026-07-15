/**
 * Git 模块：状态/diff/commit/历史/分支的 UI 与 ipc 调用封装。
 * 依赖 filesystem 获取 workspace 路径，不被其他模块反向依赖。
 */
export { useGitStore } from "./store";
export type {
  BranchInfo,
  CommitInfo,
  DiffLine,
  GitFileStatus,
  GitPanelTab,
  SelectedDiffTarget,
} from "./types";
export { default as GitPanel } from "./components/GitPanel.vue";
