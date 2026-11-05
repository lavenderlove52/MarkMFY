/**
 * 设置相关 Tauri command 封装。
 * 业务模块只应通过这里访问设置持久化，不直接 invoke。
 */
import { invoke } from "@tauri-apps/api/core";

export type ThemeMode = "light" | "dark";
export type UiStyle = "classic" | "fresh";

export interface AppSettings {
  theme: ThemeMode;
  uiStyle?: UiStyle;
  editorFontFamily: string;
  editorFontSize: number;
  editorContentWidth?: number;
  keybindings?: Record<string, string>;
  lastWorkspacePath?: string;
  recentWorkspacePaths?: string[];
  sidebarWidth?: number;
  gitPanelWidth?: number;
  sidebarOpen?: boolean;
  gitPanelOpen?: boolean;
  lastFontColor?: string;
  lastBackgroundColor?: string;
}

export function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("settings_load");
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("settings_save", { settings });
}
