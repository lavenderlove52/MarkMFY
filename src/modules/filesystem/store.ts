import { defineStore } from "pinia";
import { createDir, createFile, listDir, pickFolder, pickOpenFile } from "../../ipc";
import { showToast, toastError } from "../../notify";
import type { FileTreeNode } from "./types";

function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${sep}${name}`;
}

function parentDir(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

function isPathInside(root: string, target: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const r = norm(root);
  const t = norm(target);
  return t === r || t.startsWith(`${r}/`);
}

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

function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** 在目录下生成不冲突的名称（如 未命名.md / 未命名-2.md）。 */
function uniqueName(existing: Set<string>, base: string, ext = ""): string {
  const full = `${base}${ext}`;
  if (!existing.has(full.toLowerCase())) return full;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    rootPath: null as string | null,
    tree: [] as FileTreeNode[],
    /** 当前选中的树节点路径（文件或目录），用于新建落点 */
    selectedPath: null as string | null,
  }),
  getters: {
    isOpen(state): boolean {
      return state.rootPath !== null;
    },
  },
  actions: {
    /** 弹出系统文件夹选择框，选中后作为工作区打开。成功返回路径，取消返回 null。 */
    async openFolder(): Promise<string | null> {
      try {
        const folder = await pickFolder();
        if (!folder) return null;
        const ok = await this.openFolderPath(folder);
        return ok ? folder : null;
      } catch (err) {
        toastError(err, "打开文件夹失败");
        return null;
      }
    },

    /**
     * 弹出系统文件选择框：以其父目录为工作区打开。
     * 成功返回 `{ workspace, file }`，取消返回 null。
     */
    async openFileAsWorkspace(): Promise<{ workspace: string; file: string } | null> {
      try {
        const file = await pickOpenFile();
        if (!file) return null;
        const workspace = parentDir(file);
        if (!workspace) {
          toastError(new Error("无法解析文件所在目录"), "打开文件失败");
          return null;
        }
        const ok = await this.openFolderPath(workspace);
        if (!ok) return null;
        this.selectPath(file);
        return { workspace, file };
      } catch (err) {
        toastError(err, "打开文件失败");
        return null;
      }
    },

    /**
     * 直接打开指定路径为工作区（用于启动恢复上次文件夹）。
     * @returns 是否成功打开
     */
    async openFolderPath(folderPath: string): Promise<boolean> {
      const folder = folderPath.trim();
      if (!folder) return false;
      try {
        this.tree = await buildChildren(folder);
        this.rootPath = folder;
        this.selectedPath = null;
        return true;
      } catch (err) {
        this.rootPath = null;
        this.tree = [];
        this.selectedPath = null;
        toastError(err, "打开文件夹失败");
        return false;
      }
    },

    selectPath(path: string | null): void {
      this.selectedPath = path;
    },

    /** 解析新建操作的目标父目录：选中目录用其自身，选中文件用其父目录，否则用根。 */
    resolveCreateParent(): string | null {
      if (!this.rootPath) return null;
      if (!this.selectedPath) return this.rootPath;
      const node = findNode(this.tree, this.selectedPath);
      if (node?.isDir) return node.path;
      return parentDir(this.selectedPath);
    },

    /** 展开/折叠一个目录节点，首次展开时才向后端请求子节点。 */
    async toggleNode(node: FileTreeNode): Promise<void> {
      if (!node.isDir) return;
      try {
        if (!node.loaded) {
          node.children = await buildChildren(node.path);
          node.loaded = true;
        }
        node.expanded = !node.expanded;
      } catch (err) {
        toastError(err, "读取目录失败");
      }
    },

    /** 重新加载整棵工作区文件树（例如 Git 分支切换后调用）。 */
    async refresh(): Promise<void> {
      if (!this.rootPath) return;
      try {
        this.tree = await buildChildren(this.rootPath);
      } catch (err) {
        toastError(err, "刷新文件树失败");
      }
    },

    /** 刷新指定目录在树中的子节点（已展开则保持展开）。 */
    async refreshDir(dirPath: string): Promise<void> {
      if (!this.rootPath) return;
      if (dirPath === this.rootPath) {
        await this.refresh();
        return;
      }
      const node = findNode(this.tree, dirPath);
      if (!node || !node.isDir) return;
      try {
        node.children = await buildChildren(dirPath);
        node.loaded = true;
        node.expanded = true;
      } catch (err) {
        toastError(err, "刷新目录失败");
      }
    },

    /**
     * 在目标目录新建 Markdown 文件。
     * @param preferredName 用户输入名（可无扩展名）；空则自动命名
     * @returns 新建文件绝对路径；失败返回 null
     */
    async createMarkdownFile(preferredName?: string | null): Promise<string | null> {
      const parent = this.resolveCreateParent();
      if (!parent || !this.rootPath) {
        showToast("请先打开工作区", "error");
        return null;
      }
      if (!isPathInside(this.rootPath, parent)) {
        showToast("只能在工作区内创建", "error");
        return null;
      }

      try {
        const entries = await listDir(parent);
        const existing = new Set(entries.map((e) => e.name.toLowerCase()));
        let name = (preferredName ?? "").trim();
        if (!name) {
          name = uniqueName(existing, "未命名", ".md");
        } else {
          if (!/\.md$/i.test(name)) name = `${name}.md`;
          if (existing.has(name.toLowerCase())) {
            showToast(`已存在：${name}`, "error");
            return null;
          }
        }
        const filePath = joinPath(parent, name);
        await createFile(filePath, "");
        await this.refreshDir(parent);
        this.selectedPath = filePath;
        return filePath;
      } catch (err) {
        toastError(err, "新建文件失败");
        return null;
      }
    },

    /**
     * 在目标目录新建文件夹。
     * @returns 新建目录绝对路径；失败返回 null
     */
    async createFolder(preferredName?: string | null): Promise<string | null> {
      const parent = this.resolveCreateParent();
      if (!parent || !this.rootPath) {
        showToast("请先打开工作区", "error");
        return null;
      }
      if (!isPathInside(this.rootPath, parent)) {
        showToast("只能在工作区内创建", "error");
        return null;
      }

      try {
        const entries = await listDir(parent);
        const existing = new Set(entries.map((e) => e.name.toLowerCase()));
        let name = (preferredName ?? "").trim();
        if (!name) {
          name = uniqueName(existing, "新建文件夹");
        } else if (existing.has(name.toLowerCase())) {
          showToast(`已存在：${name}`, "error");
          return null;
        }
        if (/[\\/]/.test(name) || name === "." || name === "..") {
          showToast("名称不合法", "error");
          return null;
        }
        const dirPath = joinPath(parent, name);
        await createDir(dirPath);
        await this.refreshDir(parent);
        this.selectedPath = dirPath;
        return dirPath;
      } catch (err) {
        toastError(err, "新建文件夹失败");
        return null;
      }
    },
  },
});
