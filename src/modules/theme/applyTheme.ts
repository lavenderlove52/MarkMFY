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
  colorAccentHover: string;
  colorAccentSoft: string;
  colorPanel: string;
  colorSurface: string;
  colorSurfaceElevated: string;
  colorHover: string;
  colorActive: string;
  colorDanger: string;
  colorDangerSoft: string;
  colorSuccess: string;
  colorSuccessSoft: string;
  /** 语法高亮 token 颜色，取自 Okabe-Ito 色盲安全色板，避免红绿对比 */
  syntaxKeyword: string;
  syntaxAtom: string;
  syntaxLiteral: string;
  syntaxString: string;
  syntaxType: string;
  syntaxComment: string;
  syntaxMeta: string;
  shadowPanel: string;
  shadowOverlay: string;
}

const LIGHT: ThemeTokens = {
  colorBg: "#fbfbfe",
  colorBgMuted: "#f1f1f8",
  colorText: "#1c1d2b",
  colorTextMuted: "#6b6d85",
  colorBorder: "rgba(32, 34, 66, 0.10)",
  colorAccent: "#6d5ef8",
  colorAccentHover: "#5a47ef",
  colorAccentSoft: "rgba(109, 94, 248, 0.12)",
  colorPanel: "#ffffff",
  colorSurface: "#ffffff",
  colorSurfaceElevated: "#ffffff",
  colorHover: "rgba(32, 34, 66, 0.05)",
  colorActive: "rgba(109, 94, 248, 0.14)",
  colorDanger: "#e5484d",
  colorDangerSoft: "rgba(229, 72, 77, 0.10)",
  colorSuccess: "#189a67",
  colorSuccessSoft: "rgba(24, 154, 103, 0.12)",
  syntaxKeyword: "#883e8c",
  syntaxAtom: "#a3690a",
  syntaxLiteral: "#005b94",
  syntaxString: "#a6440a",
  syntaxType: "#0e7f82",
  syntaxComment: "#6b6d85",
  syntaxMeta: "#6b6d85",
  shadowPanel: "0 1px 2px rgba(24, 24, 55, 0.06)",
  shadowOverlay: "0 20px 60px rgba(24, 24, 55, 0.20)",
};

const DARK: ThemeTokens = {
  colorBg: "#13131c",
  colorBgMuted: "#1a1a26",
  colorText: "#e9e8f4",
  colorTextMuted: "#9b9cb8",
  colorBorder: "rgba(255, 255, 255, 0.11)",
  colorAccent: "#a394ff",
  colorAccentHover: "#b8acff",
  colorAccentSoft: "rgba(163, 148, 255, 0.18)",
  colorPanel: "#181822",
  colorSurface: "#1d1d29",
  colorSurfaceElevated: "#252533",
  colorHover: "rgba(255, 255, 255, 0.06)",
  colorActive: "rgba(163, 148, 255, 0.2)",
  colorDanger: "#ff7b7b",
  colorDangerSoft: "rgba(255, 123, 123, 0.16)",
  colorSuccess: "#4fd394",
  colorSuccessSoft: "rgba(79, 211, 148, 0.16)",
  syntaxKeyword: "#e1a5e4",
  syntaxAtom: "#f0b155",
  syntaxLiteral: "#7fc1ff",
  syntaxString: "#ff9466",
  syntaxType: "#64d9c4",
  syntaxComment: "#9b9cb8",
  syntaxMeta: "#9b9cb8",
  shadowPanel: "0 1px 2px rgba(0, 0, 0, 0.32)",
  shadowOverlay: "0 20px 60px rgba(0, 0, 0, 0.5)",
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
  root.style.setProperty("--mm-color-accent-hover", tokens.colorAccentHover);
  root.style.setProperty("--mm-color-accent-soft", tokens.colorAccentSoft);
  root.style.setProperty("--mm-color-panel", tokens.colorPanel);
  root.style.setProperty("--mm-color-surface", tokens.colorSurface);
  root.style.setProperty("--mm-color-surface-elevated", tokens.colorSurfaceElevated);
  root.style.setProperty("--mm-color-hover", tokens.colorHover);
  root.style.setProperty("--mm-color-active", tokens.colorActive);
  root.style.setProperty("--mm-color-danger", tokens.colorDanger);
  root.style.setProperty("--mm-color-danger-soft", tokens.colorDangerSoft);
  root.style.setProperty("--mm-color-success", tokens.colorSuccess);
  root.style.setProperty("--mm-color-success-soft", tokens.colorSuccessSoft);
  root.style.setProperty("--mm-syntax-keyword", tokens.syntaxKeyword);
  root.style.setProperty("--mm-syntax-atom", tokens.syntaxAtom);
  root.style.setProperty("--mm-syntax-literal", tokens.syntaxLiteral);
  root.style.setProperty("--mm-syntax-string", tokens.syntaxString);
  root.style.setProperty("--mm-syntax-type", tokens.syntaxType);
  root.style.setProperty("--mm-syntax-comment", tokens.syntaxComment);
  root.style.setProperty("--mm-syntax-meta", tokens.syntaxMeta);
  root.style.setProperty("--mm-shadow-panel", tokens.shadowPanel);
  root.style.setProperty("--mm-shadow-overlay", tokens.shadowOverlay);

  if (editor) {
    root.style.setProperty("--mm-editor-font-family", editor.fontFamily);
    root.style.setProperty("--mm-editor-font-size", `${editor.fontSize}px`);
  }
}
