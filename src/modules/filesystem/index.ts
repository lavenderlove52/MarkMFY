/**
 * FileSystem 模块：文件树读取、文件读写封装、workspace 管理。
 * 基础设施模块，通过 ipc 层调用 Rust 命令，不依赖其他业务模块。
 */
export { useWorkspaceStore } from "./store";
export type { FileTreeNode } from "./types";
export { default as FileTree } from "./components/FileTree.vue";
