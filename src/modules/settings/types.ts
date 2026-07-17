/** Settings 模块公共类型。 */

export type ThemeMode = "light" | "dark";

/** 界面风格包：classic=原版紫雾；fresh=雾蓝清新（默认） */
export type UiStyle = "classic" | "fresh";

export interface AppSettings {
  theme: ThemeMode;
  /** 界面风格：保留原版或使用清新设计 */
  uiStyle: UiStyle;
  /** CSS font-family 字符串 */
  editorFontFamily: string;
  /** 编辑器字号（px），范围 10–28 */
  editorFontSize: number;
  /** 快捷键覆盖：commandId → 如 `Mod-Shift-p` */
  keybindings: Record<string, string>;
  /** 上次成功打开的工作区绝对路径；空字符串表示无 */
  lastWorkspacePath: string;
  /** 左侧文件目录栏宽度（px） */
  sidebarWidth: number;
  /** 右侧 Git 栏宽度（px） */
  gitPanelWidth: number;
  /** 左侧文件目录是否展开 */
  sidebarOpen: boolean;
  /** 右侧 Git 栏是否展开 */
  gitPanelOpen: boolean;
  /** 格式工具栏：上次使用的字体颜色 */
  lastFontColor: string;
  /** 格式工具栏：上次使用的背景颜色（可为 transparent） */
  lastBackgroundColor: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  uiStyle: "fresh",
  editorFontFamily: '"Segoe UI", "Microsoft YaHei UI", system-ui, -apple-system, sans-serif',
  editorFontSize: 16,
  keybindings: {},
  lastWorkspacePath: "",
  sidebarWidth: 240,
  gitPanelWidth: 320,
  sidebarOpen: true,
  gitPanelOpen: true,
  lastFontColor: "#000000",
  lastBackgroundColor: "#fef3c7",
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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "transparent") return "transparent";
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return fallback;
}

export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const theme = raw?.theme === "dark" ? "dark" : "light";
  const uiStyle = raw?.uiStyle === "classic" ? "classic" : "fresh";
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
    uiStyle,
    editorFontFamily: fontFamily,
    editorFontSize,
    keybindings: normalizeKeybindings(raw?.keybindings),
    lastWorkspacePath:
      typeof raw?.lastWorkspacePath === "string" ? raw.lastWorkspacePath.trim() : "",
    sidebarWidth: clampInt(raw?.sidebarWidth, 160, 480, DEFAULT_SETTINGS.sidebarWidth),
    gitPanelWidth: clampInt(raw?.gitPanelWidth, 220, 560, DEFAULT_SETTINGS.gitPanelWidth),
    sidebarOpen: raw?.sidebarOpen !== false,
    gitPanelOpen: raw?.gitPanelOpen !== false,
    lastFontColor: normalizeColor(raw?.lastFontColor, DEFAULT_SETTINGS.lastFontColor),
    lastBackgroundColor: normalizeColor(
      raw?.lastBackgroundColor,
      DEFAULT_SETTINGS.lastBackgroundColor,
    ),
  };
}
