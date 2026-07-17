/**
 * Theme 模块：根据 settings.theme + settings.uiStyle 注入 CSS 变量。
 * classic = 原版紫雾配色；fresh = 雾蓝+鼠尾草绿清新配色。
 * 只依赖 settings 导出的类型，不反向改 settings。
 */
import type { ThemeMode, UiStyle } from "../settings";

export interface ThemeTokens {
  colorBg: string;
  colorBgMuted: string;
  colorSidebar: string;
  colorEditor: string;
  colorText: string;
  colorTextMuted: string;
  colorTextTertiary: string;
  colorBorder: string;
  colorBorderStrong: string;
  colorAccent: string;
  colorAccentHover: string;
  colorAccentActive: string;
  colorAccentSoft: string;
  colorPanel: string;
  colorSurface: string;
  colorSurfaceElevated: string;
  colorHover: string;
  colorActive: string;
  colorSelection: string;
  colorFocusRing: string;
  colorDanger: string;
  colorDangerSoft: string;
  colorSuccess: string;
  colorSuccessSoft: string;
  colorWarning: string;
  colorWarningSoft: string;
  /** 语法高亮 token，Okabe-Ito 思路，避免红绿对立 */
  syntaxKeyword: string;
  syntaxAtom: string;
  syntaxLiteral: string;
  syntaxString: string;
  syntaxType: string;
  syntaxComment: string;
  syntaxMeta: string;
  shadowPanel: string;
  shadowOverlay: string;
  editorLineHeight: string;
  editorContentWidth: string;
}

/** 原版（经典）浅色 — 保持改前观感 */
const CLASSIC_LIGHT: ThemeTokens = {
  colorBg: "#fbfbfe",
  colorBgMuted: "#f1f1f8",
  colorSidebar: "#ffffff",
  colorEditor: "#fbfbfe",
  colorText: "#1c1d2b",
  colorTextMuted: "#6b6d85",
  colorTextTertiary: "#8b8da3",
  colorBorder: "rgba(32, 34, 66, 0.10)",
  colorBorderStrong: "rgba(32, 34, 66, 0.16)",
  colorAccent: "#6d5ef8",
  colorAccentHover: "#5a47ef",
  colorAccentActive: "#4b38e0",
  colorAccentSoft: "rgba(109, 94, 248, 0.12)",
  colorPanel: "#ffffff",
  colorSurface: "#ffffff",
  colorSurfaceElevated: "#ffffff",
  colorHover: "rgba(32, 34, 66, 0.05)",
  colorActive: "rgba(109, 94, 248, 0.14)",
  colorSelection: "rgba(109, 94, 248, 0.18)",
  colorFocusRing: "rgba(109, 94, 248, 0.45)",
  colorDanger: "#e5484d",
  colorDangerSoft: "rgba(229, 72, 77, 0.10)",
  colorSuccess: "#189a67",
  colorSuccessSoft: "rgba(24, 154, 103, 0.12)",
  colorWarning: "#b54708",
  colorWarningSoft: "rgba(181, 71, 8, 0.12)",
  syntaxKeyword: "#883e8c",
  syntaxAtom: "#a3690a",
  syntaxLiteral: "#005b94",
  syntaxString: "#a6440a",
  syntaxType: "#0e7f82",
  syntaxComment: "#6b6d85",
  syntaxMeta: "#6b6d85",
  shadowPanel: "0 1px 2px rgba(24, 24, 55, 0.06)",
  shadowOverlay: "0 20px 60px rgba(24, 24, 55, 0.20)",
  editorLineHeight: "1.72",
  editorContentWidth: "980px",
};

/** 原版（经典）深色 */
const CLASSIC_DARK: ThemeTokens = {
  colorBg: "#13131c",
  colorBgMuted: "#1a1a26",
  colorSidebar: "#181822",
  colorEditor: "#13131c",
  colorText: "#e9e8f4",
  colorTextMuted: "#9b9cb8",
  colorTextTertiary: "#7a7b94",
  colorBorder: "rgba(255, 255, 255, 0.11)",
  colorBorderStrong: "rgba(255, 255, 255, 0.18)",
  colorAccent: "#a394ff",
  colorAccentHover: "#b8acff",
  colorAccentActive: "#8f7ef0",
  colorAccentSoft: "rgba(163, 148, 255, 0.18)",
  colorPanel: "#181822",
  colorSurface: "#1d1d29",
  colorSurfaceElevated: "#252533",
  colorHover: "rgba(255, 255, 255, 0.06)",
  colorActive: "rgba(163, 148, 255, 0.2)",
  colorSelection: "rgba(163, 148, 255, 0.28)",
  colorFocusRing: "rgba(163, 148, 255, 0.55)",
  colorDanger: "#ff7b7b",
  colorDangerSoft: "rgba(255, 123, 123, 0.16)",
  colorSuccess: "#4fd394",
  colorSuccessSoft: "rgba(79, 211, 148, 0.16)",
  colorWarning: "#f0b155",
  colorWarningSoft: "rgba(240, 177, 85, 0.16)",
  syntaxKeyword: "#e1a5e4",
  syntaxAtom: "#f0b155",
  syntaxLiteral: "#7fc1ff",
  syntaxString: "#ff9466",
  syntaxType: "#64d9c4",
  syntaxComment: "#9b9cb8",
  syntaxMeta: "#9b9cb8",
  shadowPanel: "0 1px 2px rgba(0, 0, 0, 0.32)",
  shadowOverlay: "0 20px 60px rgba(0, 0, 0, 0.5)",
  editorLineHeight: "1.72",
  editorContentWidth: "980px",
};

/** 清新浅色：雾蓝 + 鼠尾草绿 + 暖灰 */
const FRESH_LIGHT: ThemeTokens = {
  colorBg: "#F5F7F8",
  colorBgMuted: "#EEF2F3",
  colorSidebar: "#EEF2F3",
  colorEditor: "#FCFCFA",
  colorText: "#202629",
  colorTextMuted: "#5E686D",
  colorTextTertiary: "#879196",
  colorBorder: "#DDE3E5",
  colorBorderStrong: "#C8D1D4",
  colorAccent: "#3F6F8F",
  colorAccentHover: "#315C79",
  colorAccentActive: "#274B64",
  colorAccentSoft: "rgba(63, 111, 143, 0.12)",
  colorPanel: "#EEF2F3",
  colorSurface: "#F8FAFA",
  colorSurfaceElevated: "#FFFFFF",
  colorHover: "#E4EAEB",
  colorActive: "#D8E3E5",
  colorSelection: "#D9E8F0",
  colorFocusRing: "#7BA5BD",
  colorDanger: "#A34F50",
  colorDangerSoft: "rgba(163, 79, 80, 0.12)",
  colorSuccess: "#5F8872",
  colorSuccessSoft: "rgba(95, 136, 114, 0.14)",
  colorWarning: "#A8752C",
  colorWarningSoft: "rgba(168, 117, 44, 0.14)",
  syntaxKeyword: "#6B4E8C",
  syntaxAtom: "#A8752C",
  syntaxLiteral: "#315C79",
  syntaxString: "#9A5B2F",
  syntaxType: "#3D7A6A",
  syntaxComment: "#879196",
  syntaxMeta: "#879196",
  shadowPanel: "0 1px 2px rgba(32, 38, 41, 0.05)",
  shadowOverlay: "0 16px 48px rgba(32, 38, 41, 0.14)",
  editorLineHeight: "1.8",
  editorContentWidth: "820px",
};

/** 清新深色 */
const FRESH_DARK: ThemeTokens = {
  colorBg: "#171A1B",
  colorBgMuted: "#1D2122",
  colorSidebar: "#1D2122",
  colorEditor: "#1B1E1F",
  colorText: "#E6E9E8",
  colorTextMuted: "#B4BEBC",
  colorTextTertiary: "#7E8987",
  colorBorder: "#303738",
  colorBorderStrong: "#424C4D",
  colorAccent: "#7EACC6",
  colorAccentHover: "#96BED2",
  colorAccentActive: "#6598B5",
  colorAccentSoft: "rgba(126, 172, 198, 0.16)",
  colorPanel: "#1D2122",
  colorSurface: "#222728",
  colorSurfaceElevated: "#252A2B",
  colorHover: "#292F30",
  colorActive: "#344144",
  colorSelection: "#29485A",
  colorFocusRing: "#88B8D4",
  colorDanger: "#D98686",
  colorDangerSoft: "rgba(217, 134, 134, 0.16)",
  colorSuccess: "#8FB79D",
  colorSuccessSoft: "rgba(143, 183, 157, 0.16)",
  colorWarning: "#D1A45A",
  colorWarningSoft: "rgba(209, 164, 90, 0.16)",
  syntaxKeyword: "#C4A0D4",
  syntaxAtom: "#D1A45A",
  syntaxLiteral: "#8EBFDB",
  syntaxString: "#E0A070",
  syntaxType: "#8FB79D",
  syntaxComment: "#7E8987",
  syntaxMeta: "#7E8987",
  shadowPanel: "0 1px 2px rgba(0, 0, 0, 0.28)",
  shadowOverlay: "0 18px 52px rgba(0, 0, 0, 0.45)",
  editorLineHeight: "1.8",
  editorContentWidth: "820px",
};

export function tokensFor(theme: ThemeMode, uiStyle: UiStyle = "fresh"): ThemeTokens {
  const fresh = uiStyle !== "classic";
  if (theme === "dark") return fresh ? FRESH_DARK : CLASSIC_DARK;
  return fresh ? FRESH_LIGHT : CLASSIC_LIGHT;
}

/**
 * 将主题与编辑器字体写到 documentElement CSS 变量。
 * 全局 UI 与编辑器均通过变量读取，切换无需重启。
 */
export function applyTheme(
  theme: ThemeMode,
  editor?: { fontFamily: string; fontSize: number },
  uiStyle: UiStyle = "fresh",
): void {
  const root = document.documentElement;
  const tokens = tokensFor(theme, uiStyle);
  const style = uiStyle === "classic" ? "classic" : "fresh";
  root.dataset.theme = theme;
  root.dataset.uiStyle = style;

  root.style.setProperty("--mm-color-bg", tokens.colorBg);
  root.style.setProperty("--mm-color-bg-muted", tokens.colorBgMuted);
  root.style.setProperty("--mm-color-sidebar", tokens.colorSidebar);
  root.style.setProperty("--mm-color-editor", tokens.colorEditor);
  root.style.setProperty("--mm-color-text", tokens.colorText);
  root.style.setProperty("--mm-color-text-muted", tokens.colorTextMuted);
  root.style.setProperty("--mm-color-text-tertiary", tokens.colorTextTertiary);
  root.style.setProperty("--mm-color-border", tokens.colorBorder);
  root.style.setProperty("--mm-color-border-strong", tokens.colorBorderStrong);
  root.style.setProperty("--mm-color-accent", tokens.colorAccent);
  root.style.setProperty("--mm-color-accent-hover", tokens.colorAccentHover);
  root.style.setProperty("--mm-color-accent-active", tokens.colorAccentActive);
  root.style.setProperty("--mm-color-accent-soft", tokens.colorAccentSoft);
  root.style.setProperty("--mm-color-panel", tokens.colorPanel);
  root.style.setProperty("--mm-color-surface", tokens.colorSurface);
  root.style.setProperty("--mm-color-surface-elevated", tokens.colorSurfaceElevated);
  root.style.setProperty("--mm-color-hover", tokens.colorHover);
  root.style.setProperty("--mm-color-active", tokens.colorActive);
  root.style.setProperty("--mm-color-selection", tokens.colorSelection);
  root.style.setProperty("--mm-color-focus-ring", tokens.colorFocusRing);
  root.style.setProperty("--mm-color-danger", tokens.colorDanger);
  root.style.setProperty("--mm-color-danger-soft", tokens.colorDangerSoft);
  root.style.setProperty("--mm-color-success", tokens.colorSuccess);
  root.style.setProperty("--mm-color-success-soft", tokens.colorSuccessSoft);
  root.style.setProperty("--mm-color-warning", tokens.colorWarning);
  root.style.setProperty("--mm-color-warning-soft", tokens.colorWarningSoft);
  root.style.setProperty("--mm-syntax-keyword", tokens.syntaxKeyword);
  root.style.setProperty("--mm-syntax-atom", tokens.syntaxAtom);
  root.style.setProperty("--mm-syntax-literal", tokens.syntaxLiteral);
  root.style.setProperty("--mm-syntax-string", tokens.syntaxString);
  root.style.setProperty("--mm-syntax-type", tokens.syntaxType);
  root.style.setProperty("--mm-syntax-comment", tokens.syntaxComment);
  root.style.setProperty("--mm-syntax-meta", tokens.syntaxMeta);
  root.style.setProperty("--mm-shadow-panel", tokens.shadowPanel);
  root.style.setProperty("--mm-shadow-overlay", tokens.shadowOverlay);
  root.style.setProperty("--mm-editor-line-height", tokens.editorLineHeight);
  root.style.setProperty("--mm-editor-content-width", tokens.editorContentWidth);

  if (editor) {
    root.style.setProperty("--mm-editor-font-family", editor.fontFamily);
    root.style.setProperty("--mm-editor-font-size", `${editor.fontSize}px`);
  }
}
