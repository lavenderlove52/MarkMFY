/**
 * 系统对话框相关封装（基于 @tauri-apps/plugin-dialog）。
 * 说明：Windows/macOS 原生对话框无法在同一次选择里同时选「文件或文件夹」，
 * 故分别提供 pickFolder / pickOpenFile。
 */
import { open, save } from "@tauri-apps/plugin-dialog";

/**
 * 弹出系统文件夹选择对话框，返回用户选择的文件夹路径；用户取消时返回 null。
 */
export async function pickFolder(): Promise<string | null> {
  const result = await open({
    title: "打开文件夹",
    directory: true,
    multiple: false,
  });
  if (!result || Array.isArray(result)) {
    return null;
  }
  return result;
}

/**
 * 弹出系统文件选择对话框；取消返回 null。
 */
export async function pickOpenFile(): Promise<string | null> {
  const result = await open({
    title: "打开文件",
    directory: false,
    multiple: false,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "txt"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (!result || Array.isArray(result)) {
    return null;
  }
  return result;
}

/**
 * 弹出另存为对话框，返回路径；取消返回 null。
 */
export async function pickSaveFile(options: {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  return save({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
  });
}
