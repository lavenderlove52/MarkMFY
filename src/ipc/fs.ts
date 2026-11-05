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

/** 创建新文件；若路径已存在则失败。 */
export function createFile(filePath: string, content = ""): Promise<void> {
  return invoke<void>("fs_create_file", { filePath, content });
}

/** 创建新目录；若路径已存在则失败。 */
export function createDir(dirPath: string): Promise<void> {
  return invoke<void>("fs_create_dir", { dirPath });
}

/**
 * 获取文件最后修改时间（epoch 毫秒）；文件不存在时返回 `null`。
 * 用于检测文件是否在编辑器外被其它程序修改过（外部修改检测）。
 */
export function getFileMtime(filePath: string): Promise<number | null> {
  return invoke<number | null>("fs_get_mtime", { filePath });
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
