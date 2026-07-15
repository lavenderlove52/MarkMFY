/** Settings 模块公共类型。 */

export type ThemeMode = "light" | "dark";

export interface AppSettings {
  theme: ThemeMode;
  /** CSS font-family 字符串 */
  editorFontFamily: string;
  /** 编辑器字号（px），范围 10–28 */
  editorFontSize: number;
  /** 快捷键覆盖：commandId → 如 `Mod-Shift-p` */
  keybindings: Record<string, string>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  editorFontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
  editorFontSize: 15,
  keybindings: {},
};

function normalizeKeybindings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const theme = raw?.theme === "dark" ? "dark" : "light";
  const fontFamily =
    typeof raw?.editorFontFamily === "string" && raw.editorFontFamily.trim()
      ? raw.editorFontFamily.trim()
      : DEFAULT_SETTINGS.editorFontFamily;
  const size = Number(raw?.editorFontSize);
  const editorFontSize = Number.isFinite(size)
    ? Math.min(28, Math.max(10, Math.round(size)))
    : DEFAULT_SETTINGS.editorFontSize;
  return {
    theme,
    editorFontFamily: fontFamily,
    editorFontSize,
    keybindings: normalizeKeybindings(raw?.keybindings),
  };
}
