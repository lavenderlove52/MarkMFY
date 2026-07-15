import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import type { Extension } from "@codemirror/state";

/**
 * Markdown 语言支持：CommonMark + GFM（表格/任务列表/删除线/自动链接），
 * 并通过 codeLanguages 让围栏代码块按语言自动获得语法高亮（Task017）。
 */
export function markdownLanguageSupport(): Extension {
  return markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    extensions: GFM,
  });
}
