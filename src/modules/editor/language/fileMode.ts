import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/** 走 Markdown Live Preview 的扩展名。 */
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mdx"]);

/** 与 markdown.ts / codeBlockModel 对齐的常用语言子集。 */
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

const fileLanguages = languages.filter(isCommonLanguage);

/** 从路径取小写扩展名（不含点）。 */
export function fileExtension(filePath: string): string {
  const base = filePath.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** 是否应按 Markdown + Live Preview 打开。 */
export function isMarkdownPath(filePath: string | null | undefined): boolean {
  if (!filePath) return true;
  const ext = fileExtension(filePath);
  return MARKDOWN_EXTENSIONS.has(ext);
}

/** 按文件名匹配语言描述（如 `.json` → JSON），未匹配返回 null。 */
export function resolveLanguageByFilename(
  filePath: string | null | undefined,
): LanguageDescription | null {
  if (!filePath) return null;
  const base = filePath.replace(/^.*[/\\]/, "");
  return LanguageDescription.matchFilename(fileLanguages, base);
}
