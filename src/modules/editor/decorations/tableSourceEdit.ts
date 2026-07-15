/**
 * @deprecated 请使用 blockSourceEdit.ts；本文件仅做再导出，避免旧 import 断裂。
 */
export {
  blockSourceEditField,
  clearBlockSourceEdit,
  clearTableSourceEdit,
  isBlockInSourceEdit,
  isTableInSourceEdit,
  requestBlockSourceEdit,
  requestTableSourceEdit,
  tableSourceEditField,
} from "./blockSourceEdit";
export type { BlockSourceEditRange, BlockSourceEditRange as TableSourceEditRange } from "./blockSourceEdit";
