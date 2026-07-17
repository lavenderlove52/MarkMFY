import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import type { Extension } from "@codemirror/state";
import { MathExtension } from "./mathExtension";

/** 常用语言子集，避免把 language-data 全量元数据压进主路径体感。 */
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

const codeLanguages = languages.filter(isCommonLanguage);

/**
 * Markdown 语言支持：CommonMark + GFM（表格/任务列表/删除线/自动链接）+ KaTeX 美元公式，
 * 并通过 codeLanguages 让围栏代码块按语言自动获得语法高亮（Task017）。
 * 语言包裁剪为常用子集（Task055），降低启动解析成本。
 */
export function markdownLanguageSupport(): Extension {
  return markdown({
    base: markdownLanguage,
    codeLanguages,
    extensions: [GFM, MathExtension],
  });
}
