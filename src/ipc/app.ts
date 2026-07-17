/**
 * 应用级 Tauri command 封装（启动参数等）。
 */
import { invoke } from "@tauri-apps/api/core";

export interface StartupOpenPath {
  path: string;
  isDir: boolean;
}

/** 读取本次启动命令行中可打开的文件/目录路径。 */
export function getStartupOpenPaths(): Promise<StartupOpenPath[]> {
  return invoke<StartupOpenPath[]>("app_startup_open_paths");
}
