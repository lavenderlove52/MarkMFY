/**
 * Settings 模块：设置项定义与本地持久化。
 * 被 theme / editor 读取，不反向依赖其他模块。
 */
export { useSettingsStore } from "./store";
export {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ThemeMode,
} from "./types";
export { default as SettingsPanel } from "./components/SettingsPanel.vue";
