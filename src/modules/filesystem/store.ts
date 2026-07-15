import { defineStore } from "pinia";
import { listDir, pickFolder } from "../../ipc";
import type { FileTreeNode } from "./types";

async function buildChildren(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await listDir(dirPath);
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    isDir: entry.isDir,
    children: entry.isDir ? [] : undefined,
    expanded: false,
    loaded: false,
  }));
}

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    rootPath: null as string | null,
    tree: [] as FileTreeNode[],
  }),
  getters: {
    isOpen(state): boolean {
      return state.rootPath !== null;
    },
  },
  actions: {
    /** 弹出系统文件夹选择框，选中后作为工作区打开。 */
    async openFolder(): Promise<void> {
      const folder = await pickFolder();
      if (!folder) return;
      this.rootPath = folder;
      this.tree = await buildChildren(folder);
    },

    /** 展开/折叠一个目录节点，首次展开时才向后端请求子节点。 */
    async toggleNode(node: FileTreeNode): Promise<void> {
      if (!node.isDir) return;
      if (!node.loaded) {
        node.children = await buildChildren(node.path);
        node.loaded = true;
      }
      node.expanded = !node.expanded;
    },

    /** 重新加载整棵工作区文件树（例如 Git 分支切换后调用）。 */
    async refresh(): Promise<void> {
      if (!this.rootPath) return;
      this.tree = await buildChildren(this.rootPath);
    },
  },
});
