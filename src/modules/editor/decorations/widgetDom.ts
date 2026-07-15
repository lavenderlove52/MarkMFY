import type { EditorView } from "@codemirror/view";

/**
 * 把单元格/简单行内 Markdown 安全渲染成 DOM（不走 innerHTML）。
 * 支持：`code`、**bold**、*italic*、~~strike~~；其余按纯文本。
 */
export function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const re = /(\*\*|__)(.+?)\1|(\*|_)([^*_\n]+?)\3|`([^`\n]+)`|~~([^~\n]+?)~~/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const el = document.createElement("span");
    if (match[2] !== undefined) {
      el.className = "mm-bold";
      el.textContent = match[2];
    } else if (match[4] !== undefined) {
      el.className = "mm-italic";
      el.textContent = match[4];
    } else if (match[5] !== undefined) {
      el.className = "mm-inline-code";
      el.textContent = match[5];
    } else if (match[6] !== undefined) {
      el.className = "mm-strikethrough";
      el.textContent = match[6];
    }
    parent.appendChild(el);
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
}

export function focusInsideBlock(view: EditorView, from: number, to: number): void {
  const pos = from < to ? Math.min(from + 1, to - 1) : from;
  view.dispatch({
    selection: { anchor: pos },
    scrollIntoView: true,
  });
  view.focus();
}

export function openLightbox(content: HTMLElement, title: string): void {
  const existing = document.querySelector(".mm-lightbox");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.className = "mm-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", title);

  const panel = document.createElement("div");
  panel.className = "mm-lightbox__panel";

  const bar = document.createElement("div");
  bar.className = "mm-lightbox__bar";
  const label = document.createElement("span");
  label.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "mm-lightbox__close";
  closeBtn.textContent = "关闭";
  bar.append(label, closeBtn);

  const body = document.createElement("div");
  body.className = "mm-lightbox__body";
  body.appendChild(content);

  panel.append(bar, body);
  overlay.appendChild(panel);

  const close = (): void => {
    overlay.remove();
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

export function createToolbarButton(label: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mm-widget-btn";
  btn.textContent = label;
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}
