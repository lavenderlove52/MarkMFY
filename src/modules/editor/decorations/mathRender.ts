/** KaTeX 渲染共用：编辑器 Widget 与导出管线共用同一套 API。 */
import katex from "katex";

export function renderKatexElement(tex: string, displayMode: boolean): HTMLElement {
  const el = document.createElement(displayMode ? "div" : "span");
  el.className = displayMode ? "mm-math mm-math--block" : "mm-math mm-math--inline";
  el.setAttribute("contenteditable", "false");
  try {
    katex.render(tex, el, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "html",
    });
  } catch (err) {
    el.classList.add("mm-math--error");
    el.textContent = displayMode ? `$$${tex}$$` : `$${tex}$`;
    el.title = err instanceof Error ? err.message : "公式渲染失败";
  }
  return el;
}

export function renderKatexHtml(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    const escaped = tex
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return displayMode
      ? `<pre class="mm-math-error">$$${escaped}$$</pre>`
      : `<code class="mm-math-error">$${escaped}$</code>`;
  }
}
