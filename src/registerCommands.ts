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
}

let registered = false;

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
    keywords: ["open", "folder", "workspace"],
    defaultShortcut: "Mod-o",
    run: async () => {
      await workspaceStore.openFolder();
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
