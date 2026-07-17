/**
 * Search 模块：单文件搜索替换 + 工作区跨文件搜索跳转。
 * 依赖 filesystem（工作区路径）与 ipc；跳转经 editor / tabs 公开接口。
 */
export { useSearchStore } from "./store";
export { findInText, replaceAllInText } from "./textSearch";
export type { TextMatch, SearchMode } from "./types";
export type { SearchHit, SearchRequest } from "../../ipc/search";
export { default as SearchPanel } from "./components/SearchPanel.vue";
