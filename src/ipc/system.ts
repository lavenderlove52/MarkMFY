/**
 * 系统文件管理器相关封装（基于 @tauri-apps/plugin-opener）。
 * 业务模块只应通过这里导出的函数访问，不直接 import 插件。
 */
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

/**
 * 在系统文件管理器中打开：
 * - 文件：定位并高亮选中该文件（Windows 资源管理器 / macOS Finder 等）
 * - 文件夹：直接打开该目录
 */
export async function revealInDir(path: string, isDir: boolean): Promise<void> {
  if (isDir) {
    await openPath(path);
  } else {
    await revealItemInDir(path);
  }
}
