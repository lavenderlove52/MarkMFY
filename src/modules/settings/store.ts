import { defineStore } from "pinia";
import { loadSettings, normalizeInvokeError, saveSettings } from "../../ipc";
import { toastError } from "../../notify";
import {
  DEFAULT_SETTINGS,
  normalizeEditorContentWidth,
  normalizeRecentWorkspacePaths,
  normalizeSettings,
  RECENT_WORKSPACE_LIMIT,
  workspacePathKey,
  type AppSettings,
  type ThemeMode,
  type UiStyle,
} from "./types";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    ...DEFAULT_SETTINGS,
    keybindings: { ...DEFAULT_SETTINGS.keybindings } as Record<string, string>,
    recentWorkspacePaths: [] as string[],
    loaded: false,
    saving: false,
  }),
  getters: {
    snapshot(state): AppSettings {
      return {
        theme: state.theme,
        uiStyle: state.uiStyle,
        editorFontFamily: state.editorFontFamily,
        editorFontSize: state.editorFontSize,
        editorContentWidth: state.editorContentWidth,
        keybindings: { ...state.keybindings },
        lastWorkspacePath: state.lastWorkspacePath,
        recentWorkspacePaths: [...state.recentWorkspacePaths],
        sidebarWidth: state.sidebarWidth,
        gitPanelWidth: state.gitPanelWidth,
        sidebarOpen: state.sidebarOpen,
        gitPanelOpen: state.gitPanelOpen,
        lastFontColor: state.lastFontColor,
        lastBackgroundColor: state.lastBackgroundColor,
      };
    },
  },
  actions: {
    /** 从磁盘加载设置；失败时使用默认值。 */
    async load(): Promise<void> {
      try {
        const remote = await loadSettings();
        const normalized = normalizeSettings(remote);
        this.theme = normalized.theme;
        this.uiStyle = normalized.uiStyle;
        this.editorFontFamily = normalized.editorFontFamily;
        this.editorFontSize = normalized.editorFontSize;
        this.editorContentWidth = normalized.editorContentWidth;
        this.keybindings = { ...normalized.keybindings };
        this.lastWorkspacePath = normalized.lastWorkspacePath;
        this.recentWorkspacePaths = [...normalized.recentWorkspacePaths];
        this.sidebarWidth = normalized.sidebarWidth;
        this.gitPanelWidth = normalized.gitPanelWidth;
        this.sidebarOpen = normalized.sidebarOpen;
        this.gitPanelOpen = normalized.gitPanelOpen;
        this.lastFontColor = normalized.lastFontColor;
        this.lastBackgroundColor = normalized.lastBackgroundColor;
      } catch (err) {
        console.warn("[markmfy] load settings failed, using defaults", normalizeInvokeError(err));
        this.theme = DEFAULT_SETTINGS.theme;
        this.uiStyle = DEFAULT_SETTINGS.uiStyle;
        this.editorFontFamily = DEFAULT_SETTINGS.editorFontFamily;
        this.editorFontSize = DEFAULT_SETTINGS.editorFontSize;
        this.editorContentWidth = DEFAULT_SETTINGS.editorContentWidth;
        this.keybindings = {};
        this.lastWorkspacePath = "";
        this.recentWorkspacePaths = [];
        this.sidebarWidth = DEFAULT_SETTINGS.sidebarWidth;
        this.gitPanelWidth = DEFAULT_SETTINGS.gitPanelWidth;
        this.sidebarOpen = true;
        this.gitPanelOpen = true;
        this.lastFontColor = DEFAULT_SETTINGS.lastFontColor;
        this.lastBackgroundColor = DEFAULT_SETTINGS.lastBackgroundColor;
      } finally {
        this.loaded = true;
      }
    },

    /** 立即持久化当前快照。 */
    async persist(): Promise<void> {
      this.saving = true;
      try {
        await saveSettings(this.snapshot);
      } catch (err) {
        toastError(err, "保存设置失败");
      } finally {
        this.saving = false;
      }
    },

    setTheme(theme: ThemeMode): void {
      this.theme = theme === "dark" ? "dark" : "light";
    },

    setUiStyle(uiStyle: UiStyle): void {
      this.uiStyle = uiStyle === "classic" ? "classic" : "fresh";
    },

    setEditorFontFamily(fontFamily: string): void {
      const next = fontFamily.trim();
      this.editorFontFamily = next || DEFAULT_SETTINGS.editorFontFamily;
    },

    setEditorFontSize(size: number): void {
      this.editorFontSize = Math.min(28, Math.max(10, Math.round(size)));
    },

    setEditorContentWidth(width: number): void {
      this.editorContentWidth = normalizeEditorContentWidth(width);
    },

    setKeybindings(keybindings: Record<string, string>): void {
      this.keybindings = { ...keybindings };
    },

    setLastWorkspacePath(path: string): void {
      this.lastWorkspacePath = path.trim();
    },

    /**
     * 将路径记入最近打开（置顶、去重、最多 50 条）。
     * @returns 列表是否发生变化
     */
    touchRecentWorkspacePath(path: string): boolean {
      const nextPath = path.trim();
      if (!nextPath) return false;
      const key = workspacePathKey(nextPath);
      const rest = this.recentWorkspacePaths.filter((p) => workspacePathKey(p) !== key);
      const next = [nextPath, ...rest].slice(0, RECENT_WORKSPACE_LIMIT);
      const same =
        next.length === this.recentWorkspacePaths.length &&
        next.every((p, i) => p === this.recentWorkspacePaths[i]);
      if (same) return false;
      this.recentWorkspacePaths = next;
      return true;
    },

    /** 打开失败时从最近列表移除。 */
    removeRecentWorkspacePath(path: string): boolean {
      const key = workspacePathKey(path);
      const next = this.recentWorkspacePaths.filter((p) => workspacePathKey(p) !== key);
      if (next.length === this.recentWorkspacePaths.length) return false;
      this.recentWorkspacePaths = next;
      return true;
    },

    patch(partial: Partial<AppSettings>): void {
      const next = normalizeSettings({ ...this.snapshot, ...partial });
      this.theme = next.theme;
      this.uiStyle = next.uiStyle;
      this.editorFontFamily = next.editorFontFamily;
      this.editorFontSize = next.editorFontSize;
      this.editorContentWidth = next.editorContentWidth;
      this.keybindings = { ...next.keybindings };
      this.lastWorkspacePath = next.lastWorkspacePath;
      this.recentWorkspacePaths = normalizeRecentWorkspacePaths(next.recentWorkspacePaths);
      this.sidebarWidth = next.sidebarWidth;
      this.gitPanelWidth = next.gitPanelWidth;
      this.sidebarOpen = next.sidebarOpen;
      this.gitPanelOpen = next.gitPanelOpen;
      this.lastFontColor = next.lastFontColor;
      this.lastBackgroundColor = next.lastBackgroundColor;
    },
  },
});
