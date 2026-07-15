export interface TabItem {
  /** 用文件路径作为 id，保证同一文件不会被打开为两个 tab。 */
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}
