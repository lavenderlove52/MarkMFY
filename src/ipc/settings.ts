/**
 * 设置相关 Tauri command 封装。
 * 业务模块只应通过这里访问设置持久化，不直接 invoke。
 */
import { invoke } from "@tauri-apps/api/core";

export type ThemeMode = "light" | "dark";

export interface AppSettings {
  theme: ThemeMode;
  editorFontFamily: string;
  editorFontSize: number;
  keybindings?: Record<string, string>;
}

export function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("settings_load");
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("settings_save", { settings });
}
