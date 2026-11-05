/**
 * Command 模块：命令注册中心、模糊搜索、命令面板、快捷键绑定。
 * 其他模块向其注册命令；本模块不 import 业务模块实现。
 *
 * ## 稳定公共 API（V1.0 冻结，面向未来扩展）
 *
 * - 注册 / 执行：`registerCommand` / `unregisterCommand` / `executeCommand` / `listCommands` / `getCommand`
 * - 快捷键：`effectiveShortcut` / `setShortcutOverrides` / `getShortcutOverrides` / keymap 工具
 * - UI：`CommandPalette` / `KeybindingEditor`
 * - 类型：`CommandDefinition` / `CommandListItem`
 *
 * 应用内建命令 id（由 `registerCommands.ts` 注册，视为稳定）：
 * `command.palette` | `workspace.openFolder` | `workspace.openFile` | `workspace.newFile` | `workspace.newFolder` |
 * `file.save` | `settings.open` | `theme.toggle` | `git.refresh` | `git.commit` |
 * `export.html` | `export.pdf` | `search.open` | `search.openWorkspace`
 *
 * 扩展方只经本 `index.ts` 注册新命令，禁止深路径 import。
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
