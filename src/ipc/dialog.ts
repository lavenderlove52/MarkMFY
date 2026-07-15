/**
 * 系统对话框相关封装（基于 @tauri-apps/plugin-dialog）。
 */
import { open } from "@tauri-apps/plugin-dialog";

/**
 * 弹出系统文件夹选择对话框，返回用户选择的文件夹路径；用户取消时返回 null。
 */
export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  if (!result || Array.isArray(result)) {
    return null;
  }
  return result;
}
