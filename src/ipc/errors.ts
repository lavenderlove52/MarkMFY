/**
 * 将 Tauri invoke / 任意抛出值归一为可读中文友好消息。
 * AppError 序列化为 `{ message: string }`，不能用 `String(err)`（会得到 [object Object]）。
 */
export function normalizeInvokeError(err: unknown, fallback = "操作失败"): string {
  if (err == null) return fallback;

  if (typeof err === "string") {
    const t = err.trim();
    return t || fallback;
  }

  if (err instanceof Error) {
    const t = err.message.trim();
    return t || fallback;
  }

  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const message = obj.message ?? obj.Message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    // Tauri 有时包一层 { error: { message } } 或 { error: string }
    const nested = obj.error;
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
    if (nested && typeof nested === "object") {
      const nestedMsg = (nested as Record<string, unknown>).message;
      if (typeof nestedMsg === "string" && nestedMsg.trim()) {
        return nestedMsg.trim();
      }
    }
  }

  return fallback;
}
