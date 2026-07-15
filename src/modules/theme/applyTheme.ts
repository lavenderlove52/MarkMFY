/**
 * Theme 模块：根据 settings.theme 注入 CSS 变量。
 * 只依赖 settings 导出的类型，不反向改 settings。
 */
import type { ThemeMode } from "../settings";

export interface ThemeTokens {
  colorBg: string;
  colorBgMuted: string;
  colorText: string;
  colorTextMuted: string;
  colorBorder: string;
  colorAccent: string;
  colorPanel: string;
  colorDanger: string;
}

const LIGHT: ThemeTokens = {
  colorBg: "#ffffff",
  colorBgMuted: "#f6f7f9",
  colorText: "#1f1f1f",
  colorTextMuted: "#666666",
  colorBorder: "rgba(0, 0, 0, 0.12)",
  colorAccent: "#396cd8",
  colorPanel: "#ffffff",
  colorDanger: "#cf222e",
};

const DARK: ThemeTokens = {
  colorBg: "#1e1e1e",
  colorBgMuted: "#252526",
  colorText: "#e8e8e8",
  colorTextMuted: "#a0a0a0",
  colorBorder: "rgba(255, 255, 255, 0.12)",
  colorAccent: "#6b9eff",
  colorPanel: "#2d2d2d",
  colorDanger: "#f85149",
};

export function tokensFor(theme: ThemeMode): ThemeTokens {
  return theme === "dark" ? DARK : LIGHT;
}

/**
 * 将主题与编辑器字体写到 documentElement CSS 变量。
 * 全局 UI 与编辑器均通过变量读取，切换无需重启。
 */
export function applyTheme(
  theme: ThemeMode,
  editor?: { fontFamily: string; fontSize: number },
): void {
  const root = document.documentElement;
  const tokens = tokensFor(theme);
  root.dataset.theme = theme;
  root.style.setProperty("--mm-color-bg", tokens.colorBg);
  root.style.setProperty("--mm-color-bg-muted", tokens.colorBgMuted);
  root.style.setProperty("--mm-color-text", tokens.colorText);
  root.style.setProperty("--mm-color-text-muted", tokens.colorTextMuted);
  root.style.setProperty("--mm-color-border", tokens.colorBorder);
  root.style.setProperty("--mm-color-accent", tokens.colorAccent);
  root.style.setProperty("--mm-color-panel", tokens.colorPanel);
  root.style.setProperty("--mm-color-danger", tokens.colorDanger);

  if (editor) {
    root.style.setProperty("--mm-editor-font-family", editor.fontFamily);
    root.style.setProperty("--mm-editor-font-size", `${editor.fontSize}px`);
  }
}
