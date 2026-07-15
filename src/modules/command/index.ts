/**
 * Command 模块：命令注册中心、模糊搜索、命令面板、快捷键绑定。
 * 其他模块向其注册命令；本模块不 import 业务模块实现。
 */
export type { CommandDefinition, CommandListItem } from "./types";
export {
  registerCommand,
  unregisterCommand,
  executeCommand,
  listCommands,
  getCommand,
  effectiveShortcut,
  setShortcutOverrides,
  getShortcutOverrides,
  clearCommands,
} from "./registry";
export { filterCommands } from "./fuzzy";
export {
  parseShortcut,
  eventMatchesShortcut,
  formatShortcutLabel,
  installGlobalKeymap,
} from "./keymap";
export { default as CommandPalette } from "./components/CommandPalette.vue";
export { default as KeybindingEditor } from "./components/KeybindingEditor.vue";
