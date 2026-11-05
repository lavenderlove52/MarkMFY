/**
 * Settings 模块：设置项定义与本地持久化。
 * 被 theme / editor 读取，不反向依赖其他模块。
 */
export { useSettingsStore } from "./store";
export {
  DEFAULT_SETTINGS,
  RECENT_WORKSPACE_LIMIT,
  EDITOR_CONTENT_WIDTH_MIN,
  EDITOR_CONTENT_WIDTH_MAX,
  EDITOR_CONTENT_WIDTH_UNLIMITED,
  normalizeEditorContentWidth,
  normalizeRecentWorkspacePaths,
  normalizeSettings,
  workspacePathKey,
  type AppSettings,
  type ThemeMode,
  type UiStyle,
} from "./types";
export { default as SettingsPanel } from "./components/SettingsPanel.vue";
