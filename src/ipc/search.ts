/**
 * 搜索相关 Tauri command 封装。
 */
import { invoke } from "@tauri-apps/api/core";

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  from: number;
  to: number;
  preview: string;
}

export interface SearchRequest {
  rootPath: string;
  query: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

export function searchWorkspace(request: SearchRequest): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_workspace", { request });
}
