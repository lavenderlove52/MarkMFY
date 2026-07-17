import { defineStore } from "pinia";
import { loadSettings, normalizeInvokeError, saveSettings } from "../../ipc";
import { toastError } from "../../notify";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings, type ThemeMode } from "./types";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    ...DEFAULT_SETTINGS,
    keybindings: { ...DEFAULT_SETTINGS.keybindings } as Record<string, string>,
    loaded: false,
    saving: false,
  }),
  getters: {
    snapshot(state): AppSettings {
      return {
        theme: state.theme,
        editorFontFamily: state.editorFontFamily,
        editorFontSize: state.editorFontSize,
        keybindings: { ...state.keybindings },
        lastWorkspacePath: state.lastWorkspacePath,
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
        this.editorFontFamily = normalized.editorFontFamily;
        this.editorFontSize = normalized.editorFontSize;
        this.keybindings = { ...normalized.keybindings };
        this.lastWorkspacePath = normalized.lastWorkspacePath;
        this.sidebarWidth = normalized.sidebarWidth;
        this.gitPanelWidth = normalized.gitPanelWidth;
        this.sidebarOpen = normalized.sidebarOpen;
        this.gitPanelOpen = normalized.gitPanelOpen;
        this.lastFontColor = normalized.lastFontColor;
        this.lastBackgroundColor = normalized.lastBackgroundColor;
      } catch (err) {
        console.warn("[markmfy] load settings failed, using defaults", normalizeInvokeError(err));
        this.theme = DEFAULT_SETTINGS.theme;
        this.editorFontFamily = DEFAULT_SETTINGS.editorFontFamily;
        this.editorFontSize = DEFAULT_SETTINGS.editorFontSize;
        this.keybindings = {};
        this.lastWorkspacePath = "";
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

    setEditorFontFamily(fontFamily: string): void {
      const next = fontFamily.trim();
      this.editorFontFamily = next || DEFAULT_SETTINGS.editorFontFamily;
    },

    setEditorFontSize(size: number): void {
      this.editorFontSize = Math.min(28, Math.max(10, Math.round(size)));
    },

    setKeybindings(keybindings: Record<string, string>): void {
      this.keybindings = { ...keybindings };
    },

    setLastWorkspacePath(path: string): void {
      this.lastWorkspacePath = path.trim();
    },

    patch(partial: Partial<AppSettings>): void {
      const next = normalizeSettings({ ...this.snapshot, ...partial });
      this.theme = next.theme;
      this.editorFontFamily = next.editorFontFamily;
      this.editorFontSize = next.editorFontSize;
      this.keybindings = { ...next.keybindings };
      this.lastWorkspacePath = next.lastWorkspacePath;
      this.sidebarWidth = next.sidebarWidth;
      this.gitPanelWidth = next.gitPanelWidth;
      this.sidebarOpen = next.sidebarOpen;
      this.gitPanelOpen = next.gitPanelOpen;
      this.lastFontColor = next.lastFontColor;
      this.lastBackgroundColor = next.lastBackgroundColor;
    },
  },
});
