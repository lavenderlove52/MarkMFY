/**
 * FileSystem 模块：文件树读取、workspace 管理、工作区 IO 门面。
 * 基础设施模块，通过 ipc 层调用 Rust 命令，不依赖其他业务模块。
 *
 * ## 稳定公共 API（V1.0 冻结，面向未来扩展）
 *
 * - `useWorkspaceStore` / `FileTree` / `FileTreeNode`：工作区与文件树
 * - `getWorkspaceRootPath`：只读当前工作区根路径
 * - `readWorkspaceFile` / `writeWorkspaceFile` / `listWorkspaceDir`：经本模块门面访问 IO
 * - `createWorkspaceFile` / `createWorkspaceDir`：创建文件/目录
 * - Store 另提供 `createMarkdownFile` / `createFolder` / `refresh`：带落点解析的新建与刷新
 *
 * 扩展方禁止深路径 import `modules/filesystem/**`；禁止业务模块绕过本门面直接拼路径乱读。
 * （底层仍统一走 `src/ipc/`。）
 */
import { createDir, createFile, listDir, readFile, writeFile } from "../../ipc";
import { useWorkspaceStore } from "./store";

export { useWorkspaceStore } from "./store";
export type { FileTreeNode } from "./types";
export { default as FileTree } from "./components/FileTree.vue";

/** 当前工作区根路径；未打开时返回 null。 */
export function getWorkspaceRootPath(): string | null {
  return useWorkspaceStore().rootPath;
}

/** 读取文本文件（UTF-8）；路径一般为工作区内绝对路径。 */
export function readWorkspaceFile(filePath: string): Promise<string> {
  return readFile(filePath);
}

/** 写入文本文件（UTF-8）。 */
export function writeWorkspaceFile(filePath: string, content: string): Promise<void> {
  return writeFile(filePath, content);
}

/** 列出目录条目。 */
export function listWorkspaceDir(dirPath: string): Promise<
  Awaited<ReturnType<typeof listDir>>
> {
  return listDir(dirPath);
}

/** 创建新文件（不覆盖已存在路径）。 */
export function createWorkspaceFile(filePath: string, content = ""): Promise<void> {
  return createFile(filePath, content);
}

/** 创建新目录（不覆盖已存在路径）。 */
export function createWorkspaceDir(dirPath: string): Promise<void> {
  return createDir(dirPath);
}
