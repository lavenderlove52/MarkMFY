export interface TabItem {
  /** 用文件路径作为 id，保证同一文件不会被打开为两个 tab。 */
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  /**
   * 打开/保存/重新加载成功那一刻记录的磁盘文件修改时间（epoch 毫秒）。
   * 用于外部修改检测：与当前磁盘 mtime 不一致即说明文件在编辑器之外被改过。
   * `null` 表示尚未获取到（如首次读取时查询失败），此时不触发冲突检测。
   */
  diskMtimeMs: number | null;
}

/** 检测到某个 tab 对应文件被外部修改后，等待用户处理的冲突信息。 */
export interface ExternalChangeConflict {
  tabId: string;
  fileName: string;
  /** 编辑器里是否有相对上次保存尚未写盘的修改；决定弹窗展示哪些选项。 */
  hasLocalEdits: boolean;
}
