import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/** 与 markdown.ts Task055 子集对齐；下拉可选语言标识。 */
const COMMON_LANG_ALIASES = new Set(
  [
    "javascript",
    "js",
    "typescript",
    "ts",
    "jsx",
    "tsx",
    "json",
    "html",
    "css",
    "scss",
    "less",
    "python",
    "py",
    "rust",
    "rs",
    "go",
    "java",
    "c",
    "cpp",
    "csharp",
    "cs",
    "shell",
    "bash",
    "sh",
    "powershell",
    "ps1",
    "sql",
    "yaml",
    "yml",
    "toml",
    "xml",
    "markdown",
    "md",
    "vue",
    "svelte",
    "php",
    "ruby",
    "rb",
    "swift",
    "kotlin",
    "kt",
    "r",
    "lua",
    "dockerfile",
    "diff",
    "plaintext",
    "text",
  ].map((s) => s.toLowerCase()),
);

function isCommonLanguage(lang: (typeof languages)[number]): boolean {
  const names = [lang.name, ...(lang.alias ?? [])].map((s) => s.toLowerCase());
  return names.some((n) => COMMON_LANG_ALIASES.has(n));
}

/** 供围栏嵌套高亮 / markdown codeLanguages 复用的裁剪子集。 */
export const nestedCodeLanguages: LanguageDescription[] = languages.filter(isCommonLanguage);

export interface CodeBlockLangOption {
  /** 写入围栏的标识；空字符串表示无语言 / plaintext */
  value: string;
  label: string;
}

export type CodeBlockTheme = "one-dark-pro" | "night-owl" | "darcula";

export interface CodeBlockThemeOption {
  value: CodeBlockTheme;
  label: string;
}

/** 代码块没有显式主题时使用的默认配色。 */
export const DEFAULT_CODE_BLOCK_THEME: CodeBlockTheme = "night-owl";

/** 代码块可选的语法高亮主题。 */
export const CODE_BLOCK_THEME_OPTIONS: CodeBlockThemeOption[] = [
  { value: "one-dark-pro", label: "One Dark Pro" },
  { value: "night-owl", label: "Night Owl" },
  { value: "darcula", label: "Darcula" },
];

/** 下拉选项（value 为常用 fence 标识）。 */
export const CODE_BLOCK_LANG_OPTIONS: CodeBlockLangOption[] = [
  { value: "", label: "Plain Text" },
  { value: "text", label: "Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "shell", label: "Shell" },
  { value: "bash", label: "Bash" },
  { value: "powershell", label: "PowerShell" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "xml", label: "XML" },
  { value: "markdown", label: "Markdown" },
  { value: "vue", label: "Vue" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "lua", label: "Lua" },
  { value: "r", label: "R" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "diff", label: "Diff" },
];

/** 取围栏 info 第一段并小写。 */
export function normalizeFenceLang(raw: string): string {
  return raw.trim().toLowerCase().split(/\s+/)[0] ?? "";
}

/** 读取围栏 info 中的语言和代码块主题。 */
export function parseFenceInfo(raw: string): {
  lang: string;
  theme: CodeBlockTheme;
} {
  const themeMatch = /(?:^|\s)theme=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i.exec(raw);
  const rawTheme = (themeMatch?.[1] ?? themeMatch?.[2] ?? themeMatch?.[3] ?? "").toLowerCase();
  const theme = CODE_BLOCK_THEME_OPTIONS.find((option) => option.value === rawTheme)?.value;
  return {
    lang: normalizeFenceLang(raw),
    theme: theme ?? DEFAULT_CODE_BLOCK_THEME,
  };
}

/** 下拉回显：未知别名保留原文，便于显示后再写入。 */
export function fenceLangForSelect(raw: string): string {
  const lang = normalizeFenceLang(raw);
  if (!lang || lang === "plaintext") return "";
  const exact = CODE_BLOCK_LANG_OPTIONS.find((o) => o.value === lang);
  if (exact) return exact.value;
  const desc = resolveLanguageDescription(lang);
  if (desc) {
    const preferred = CODE_BLOCK_LANG_OPTIONS.find(
      (o) =>
        o.value &&
        (o.value === desc.name.toLowerCase() ||
          desc.alias.some((a) => a.toLowerCase() === o.value)),
    );
    if (preferred) return preferred.value;
  }
  return lang;
}

export function resolveLanguageDescription(lang: string): LanguageDescription | null {
  const key = normalizeFenceLang(lang);
  if (!key || key === "text" || key === "plaintext") return null;
  return LanguageDescription.matchLanguageName(nestedCodeLanguages, key, true);
}

/** 规范化代码正文（统一换行，去掉末尾多余空行保一层语义由序列化补）。 */
export function normalizeCodeBody(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

/** 序列化为标准围栏；始终以换行结尾便于下一段 Markdown。 */
export function serializeFencedCode(
  lang: string,
  body: string,
  theme: CodeBlockTheme = DEFAULT_CODE_BLOCK_THEME,
): string {
  const normalizedLang = normalizeFenceLang(lang);
  const includeTheme = theme !== DEFAULT_CODE_BLOCK_THEME;
  const info = [
    includeTheme && !normalizedLang ? "text" : normalizedLang,
    includeTheme ? `theme=${theme}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const normalized = normalizeCodeBody(body);
  const open = info ? `\`\`\`${info}` : "```";
  return `${open}\n${normalized}\n\`\`\`\n`;
}

/** 对齐原文档是否带尾换行，避免反复抖一行。 */
export function matchFenceTrailingNewline(original: string, insert: string): string {
  const originalEndsWithNl = original.endsWith("\n");
  let next = insert;
  if (originalEndsWithNl && !next.endsWith("\n")) next += "\n";
  if (!originalEndsWithNl && next.endsWith("\n")) next = next.slice(0, -1);
  return next;
}
