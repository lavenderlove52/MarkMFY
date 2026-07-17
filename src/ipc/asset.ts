/**
 * 将本地绝对路径转为 WebView 可加载的 asset URL。
 * 业务模块应通过本函数访问，禁止直接 import @tauri-apps/api。
 */
import { convertFileSrc } from "@tauri-apps/api/core";

export function toAssetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}
