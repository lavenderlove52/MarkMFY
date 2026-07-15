export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
  expanded: boolean;
  loaded: boolean;
}
