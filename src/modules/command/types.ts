/** Command 模块公共类型。 */

export interface CommandDefinition {
  /** 稳定唯一 id，如 `workspace.openFolder` */
  id: string;
  /** 面板中展示的标题 */
  title: string;
  /** 次要说明 */
  subtitle?: string;
  /** 参与模糊搜索的额外关键字 */
  keywords?: string[];
  /**
   * 默认快捷键，格式如 `Mod-s` / `Mod-Shift-p` / `Alt-t`。
   * Mod = Ctrl（Win）或 Meta（Mac）。
   */
  defaultShortcut?: string;
  /** 返回 false 时不出现在面板，快捷键也不触发 */
  when?: () => boolean;
  run: () => void | Promise<void>;
}

export interface CommandListItem extends CommandDefinition {
  /** 生效中的快捷键（含用户覆盖） */
  shortcut?: string;
}
