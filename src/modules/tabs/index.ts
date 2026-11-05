/**
 * Tabs 模块：多标签状态与当前激活文档追踪。
 * 依赖 filesystem（通过 ipc 读写文件），被 editor 依赖。
 */
export { useTabsStore } from "./store";
export type { TabItem, ExternalChangeConflict } from "./types";
export { default as TabsBar } from "./components/TabsBar.vue";
export { default as UnsavedChangesDialog } from "./components/UnsavedChangesDialog.vue";
export { default as ExternalChangeDialog } from "./components/ExternalChangeDialog.vue";
export {
  setActiveTabContentReader,
  readActiveTabContent,
  setApplyStoreContentToEditor,
  applyStoreContentToActiveEditor,
  type ActiveTabContentReader,
} from "./contentBridge";
