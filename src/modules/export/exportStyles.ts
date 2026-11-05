/** 导出 HTML 内嵌基础样式（自包含，不依赖编辑器主题变量）。 */

export const EXPORT_DOCUMENT_CSS = `
:root {
  color-scheme: light;
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 820px;
  padding: 32px 24px 64px;
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: #1f1f1f;
  background: #ffffff;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.35;
  margin: 1.4em 0 0.6em;
  font-weight: 700;
}
h1 { font-size: 1.9em; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.25em; }
h3 { font-size: 1.25em; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
a { color: #0969da; }
img { max-width: 100%; height: auto; }
blockquote {
  margin-left: 0;
  padding: 0.2em 1em;
  color: #57606a;
  border-left: 4px solid #d0d7de;
  background: #f6f8fa;
}
code {
  font-family: Consolas, "Courier New", monospace;
  font-size: 0.92em;
  background: rgba(175, 184, 193, 0.2);
  padding: 0.15em 0.4em;
  border-radius: 4px;
}
pre {
  padding: 12px 14px;
  overflow: auto;
  background: #f6f8fa;
  border-radius: 6px;
  border: 1px solid #d0d7de;
}
pre code {
  background: transparent;
  padding: 0;
  font-size: 13px;
  line-height: 1.55;
}
/* 宽表靠单元格换行适配纸宽；勿用 display:block + overflow-x（打印会裁切右侧） */
table {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}
th, td {
  border: 1px solid #d0d7de;
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}
th { background: #f6f8fa; }
hr {
  border: none;
  border-top: 1px solid #d0d7de;
  margin: 1.5em 0;
}
.task-list-item { list-style: none; }
.task-list-item input { margin-right: 6px; }
.contains-task-list { padding-left: 1.2em; }
@media print {
  body { max-width: none; padding: 0; }
  a { color: inherit; text-decoration: none; }
  pre { break-inside: avoid; overflow: visible; white-space: pre-wrap; }
  table {
    display: table;
    width: 100%;
    overflow: visible;
  }
  th, td {
    overflow: visible;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  thead { display: table-header-group; }
}
`.trim();
