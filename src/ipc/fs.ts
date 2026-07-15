/**
 * 文件系统相关 Tauri command 的统一封装层。
 * 业务模块只应通过这里导出的函数访问文件系统，不直接调用 invoke。
 */
import { invoke } from "@tauri-apps/api/core";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export function listDir(dirPath: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("fs_list_dir", { dirPath });
}

export function readFile(filePath: string): Promise<string> {
  return invoke<string>("fs_read_file", { filePath });
}

export function writeFile(filePath: string, content: string): Promise<void> {
  return invoke<void>("fs_write_file", { filePath, content });
}

/**
 * 保存粘贴/拖拽的图片二进制数据到 markdown 文件同级的 assets 目录，返回相对路径。
 */
export function savePastedImage(
  markdownFilePath: string,
  fileName: string,
  data: Uint8Array,
): Promise<string> {
  return invoke<string>("fs_save_pasted_image", {
    markdownFilePath,
    fileName,
    data: Array.from(data),
  });
}
