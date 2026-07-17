/** Search 模块类型（再导出，便于 index 统一暴露）。 */

export type { TextMatch } from "./textSearch";
export type { SearchHit, SearchRequest } from "../../ipc";

export type SearchMode = "file" | "workspace";
