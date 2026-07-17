import { reactive } from "vue";
import { normalizeInvokeError } from "../ipc/errors";

export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const state = reactive({
  items: [] as ToastItem[],
});

let nextId = 1;
const DEFAULT_DURATION_MS = 4200;

export function toastState(): { items: ToastItem[] } {
  return state;
}

/** 显示一条短暂通知（不引入第三方 UI 库）。 */
export function showToast(
  message: string,
  kind: ToastKind = "info",
  durationMs = DEFAULT_DURATION_MS,
): void {
  const text = message.trim();
  if (!text) return;
  const id = nextId++;
  state.items.push({ id, message: text, kind });
  window.setTimeout(() => {
    dismissToast(id);
  }, durationMs);
}

export function dismissToast(id: number): void {
  const i = state.items.findIndex((t) => t.id === id);
  if (i >= 0) state.items.splice(i, 1);
}

/** 失败提示：归一错误后弹出 error toast，并返回消息文本。 */
export function toastError(err: unknown, fallback = "操作失败"): string {
  const message = normalizeInvokeError(err, fallback);
  showToast(message, "error");
  return message;
}
