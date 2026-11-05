/**
 * 应用层命令注册：组装各业务 store/UI 动作为 Command。
 * 放在 src/ 根下而非 command 模块内，避免 Command 反向依赖业务实现。
 */
import {
  executeCommand,
  registerCommand,
  setShortcutOverrides,
} from "./modules/command";
import { useWorkspaceStore } from "./modules/filesystem";
import { useGitStore } from "./modules/git";
import { useSettingsStore } from "./modules/settings";
import { useTabsStore } from "./modules/tabs";

export interface RegisterCommandsOptions {
  openSettings: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  isCommandPaletteOpen: () => boolean;
  openSearch: (mode: "file" | "workspace") => void;
}

let registered = false;

function getActiveExportInput(): {
  markdown: string;
  title: string;
  filePath: string;
} | null {
  const tabsStore = useTabsStore();
  tabsStore.materializeActiveContent();
  const tab = tabsStore.activeTab;
  if (!tab) return null;
  return {
    markdown: tab.content,
    title: tab.fileName.replace(/\.md$/i, "") || tab.fileName,
    filePath: tab.filePath,
  };
}

/** 注册应用内建命令（幂等：重复调用会覆盖同 id）。 */
export function registerAppCommands(options: RegisterCommandsOptions): void {
  const workspaceStore = useWorkspaceStore();
  const tabsStore = useTabsStore();
  const settingsStore = useSettingsStore();
  const gitStore = useGitStore();

  registerCommand({
    id: "command.palette",
    title: "打开命令面板",
    keywords: ["command", "palette", "命令"],
    defaultShortcut: "Mod-Shift-p",
    run: () => {
      if (options.isCommandPaletteOpen()) {
        options.closeCommandPalette();
      } else {
        options.openCommandPalette();
      }
    },
  });

  registerCommand({
    id: "workspace.openFolder",
    title: "打开文件夹",
    subtitle: "选择工作区目录",
    keywords: ["open", "folder", "workspace", "目录"],
    defaultShortcut: "Mod-Shift-o",
    run: async () => {
      await workspaceStore.openFolder();
    },
  });

  registerCommand({
    id: "workspace.openFile",
    title: "打开文件",
    subtitle: "选择文件并以其所在目录为工作区",
    keywords: ["open", "file", "打开", "文件"],
    defaultShortcut: "Mod-o",
    run: async () => {
      const result = await workspaceStore.openFileAsWorkspace();
      if (result) await tabsStore.openFile(result.file);
    },
  });

  registerCommand({
    id: "workspace.newFile",
    title: "新建 Markdown 文件",
    subtitle: "在当前选中目录或工作区根目录",
    keywords: ["new", "file", "markdown", "新建", "文件"],
    when: () => workspaceStore.isOpen,
    run: async () => {
      const name = window.prompt("新建 Markdown 文件名（可省略 .md）", "未命名");
      if (name === null) return;
      const path = await workspaceStore.createMarkdownFile(name.trim() || null);
      if (path) await tabsStore.openFile(path);
    },
  });

  registerCommand({
    id: "workspace.newFolder",
    title: "新建文件夹",
    subtitle: "在当前选中目录或工作区根目录",
    keywords: ["new", "folder", "mkdir", "新建", "文件夹"],
    when: () => workspaceStore.isOpen,
    run: async () => {
      const name = window.prompt("新建文件夹名称", "新建文件夹");
      if (name === null) return;
      await workspaceStore.createFolder(name.trim() || null);
    },
  });

  registerCommand({
    id: "file.save",
    title: "保存当前文件",
    keywords: ["save", "保存"],
    defaultShortcut: "Mod-s",
    when: () => !!tabsStore.activeTab,
    run: async () => {
      const tab = tabsStore.activeTab;
      if (!tab) return;
      await tabsStore.saveTab(tab.id);
    },
  });

  registerCommand({
    id: "settings.open",
    title: "打开设置",
    keywords: ["settings", "preferences", "设置"],
    defaultShortcut: "Mod-,",
    run: () => {
      options.openSettings();
    },
  });

  registerCommand({
    id: "theme.toggle",
    title: "切换浅色/深色主题",
    keywords: ["theme", "dark", "light", "主题"],
    defaultShortcut: "Mod-Alt-t",
    run: () => {
      const next = settingsStore.theme === "dark" ? "light" : "dark";
      settingsStore.setTheme(next);
      void settingsStore.persist();
    },
  });

  registerCommand({
    id: "git.refresh",
    title: "刷新 Git 状态",
    keywords: ["git", "refresh", "status"],
    when: () => !!workspaceStore.rootPath,
    run: async () => {
      await gitStore.refresh(workspaceStore.rootPath);
    },
  });

  registerCommand({
    id: "git.commit",
    title: "提交暂存更改",
    subtitle: "需已填写提交说明且有已暂存文件",
    keywords: ["git", "commit"],
    when: () =>
      !!workspaceStore.rootPath &&
      gitStore.isRepo &&
      gitStore.stagedFiles.length > 0 &&
      !!gitStore.commitMessage.trim(),
    run: async () => {
      if (!workspaceStore.rootPath) return;
      await gitStore.commit(workspaceStore.rootPath);
    },
  });

  registerCommand({
    id: "export.html",
    title: "导出为 HTML",
    keywords: ["export", "html", "导出"],
    when: () => !!tabsStore.activeTab,
    run: async () => {
      const input = getActiveExportInput();
      if (!input) return;
      const { exportHtmlFile } = await import("./modules/export");
      await exportHtmlFile(input);
    },
  });

  registerCommand({
    id: "export.pdf",
    title: "导出为 PDF（打印）",
    subtitle: "打开系统打印对话框，可选择 Print to PDF",
    keywords: ["export", "pdf", "print", "导出", "打印"],
    when: () => !!tabsStore.activeTab,
    run: async () => {
      const input = getActiveExportInput();
      if (!input) return;
      const { exportPdfViaPrint } = await import("./modules/export");
      await exportPdfViaPrint(input);
    },
  });

  registerCommand({
    id: "search.open",
    title: "在当前文件中查找",
    keywords: ["search", "find", "查找", "搜索"],
    defaultShortcut: "Mod-f",
    run: () => {
      options.openSearch("file");
    },
  });

  registerCommand({
    id: "search.openWorkspace",
    title: "在工作区中搜索",
    keywords: ["search", "workspace", "全局", "搜索"],
    defaultShortcut: "Mod-Shift-f",
    run: () => {
      options.openSearch("workspace");
    },
  });

  setShortcutOverrides(settingsStore.keybindings);
  registered = true;
}

export function syncCommandKeybindings(overrides: Record<string, string>): void {
  setShortcutOverrides(overrides);
}

/** 供工具栏等直接触发（未注册时安全降级）。 */
export async function runCommand(id: string): Promise<void> {
  if (!registered) return;
  await executeCommand(id);
}
