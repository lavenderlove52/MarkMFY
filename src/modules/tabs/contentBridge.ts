/**
 * 活跃编辑器内容读取桥：Editor 注册，tabs/Git 在保存、切分支前物化全文，
 * 避免每键把整篇文档写入 Pinia。
 */

export type ActiveTabContentReader = () => { tabId: string; content: string } | null;

let reader: ActiveTabContentReader | null = null;
let applyFromStore: (() => void) | null = null;

/** 由 Editor 在挂载时注册；卸载时传 null。 */
export function setActiveTabContentReader(next: ActiveTabContentReader | null): void {
  reader = next;
}

/** 读取当前编辑器文档（若已注册）。 */
export function readActiveTabContent(): { tabId: string; content: string } | null {
  return reader?.() ?? null;
}

/**
 * 由 Editor 注册：把 store 中活跃 tab 的 content 写回 EditorView
 *（放弃未保存修改后避免画面与 store 不一致）。
 */
export function setApplyStoreContentToEditor(next: (() => void) | null): void {
  applyFromStore = next;
}

export function applyStoreContentToActiveEditor(): void {
  applyFromStore?.();
}
