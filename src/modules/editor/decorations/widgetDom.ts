import type { EditorView } from "@codemirror/view";

export interface InlineMarkdownOptions {
  /**
   * 相对路径 → 可加载的 URL（同 Editor.vue 的 resolveImageSrc）。不传时
   * `![]()` 语法按纯文本处理，保持旧行为（目前只有表格单元格会传入，用来
   * 支持粘贴进单元格的图片实际展示，而不是显示一串 `![](...)` 源码）。
   */
  resolveImageSrc?: (rawPath: string) => string;
}

const INLINE_MARKDOWN_RE =
  /<br\s*\/?>|(\*\*|__)(.+?)\1|(\*|_)([^*_\n]+?)\3|`([^`\n]+)`|~~([^~\n]+?)~~|!\[([^[\]]*)\]\(([^()\s]+)\)|\[([^[\]]*)\]\(([^()\s]+)\)/gi;

/**
 * 把单元格/简单行内 Markdown 安全渲染成 DOM（不走 innerHTML）。
 * 支持：`code`、**bold**、*italic*、~~strike~~、`<br>`、`![alt](src)`、`[text](href)`；其余按纯文本。
 */
export function appendInlineMarkdown(
  parent: HTMLElement,
  text: string,
  options: InlineMarkdownOptions = {},
): void {
  const re = new RegExp(INLINE_MARKDOWN_RE.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    if (/^<br/i.test(match[0])) {
      parent.appendChild(document.createElement("br"));
    } else if (match[2] !== undefined) {
      const el = document.createElement("span");
      el.className = "mm-bold";
      el.textContent = match[2];
      parent.appendChild(el);
    } else if (match[4] !== undefined) {
      const el = document.createElement("span");
      el.className = "mm-italic";
      el.textContent = match[4];
      parent.appendChild(el);
    } else if (match[5] !== undefined) {
      const el = document.createElement("span");
      el.className = "mm-inline-code";
      el.textContent = match[5];
      parent.appendChild(el);
    } else if (match[6] !== undefined) {
      const el = document.createElement("span");
      el.className = "mm-strikethrough";
      el.textContent = match[6];
      parent.appendChild(el);
    } else if (match[8] !== undefined) {
      appendInlineImage(parent, match[7] ?? "", match[8], options.resolveImageSrc, match[0]);
    } else if (match[10] !== undefined) {
      const a = document.createElement("a");
      a.className = "mm-inline-link";
      a.href = match[10];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = match[9] || match[10];
      parent.appendChild(a);
    } else {
      parent.appendChild(document.createTextNode(match[0]));
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
}

function appendInlineImage(
  parent: HTMLElement,
  alt: string,
  rawSrc: string,
  resolveImageSrc: ((rawPath: string) => string) | undefined,
  rawMatch: string,
): void {
  if (!resolveImageSrc) {
    parent.appendChild(document.createTextNode(rawMatch));
    return;
  }
  const img = document.createElement("img");
  img.className = "mm-inline-image";
  img.alt = alt;
  img.src = resolveImageSrc(rawSrc);
  img.addEventListener("error", () => {
    img.replaceWith(document.createTextNode(`[图片加载失败: ${alt || rawSrc}]`));
  });
  parent.appendChild(img);
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

/** 复制文本到系统剪贴板；返回是否成功（供调用方决定提示文案）。 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 加载 <img> 的 Promise 化包装；超时/失败均 reject，保证调用方不会被无限期挂起。 */
function loadImage(src: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error("图片加载超时")), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("图片加载失败"));
    };
    img.src = src;
  });
}

/**
 * 把 SVG 元素栅格化为 PNG Blob。
 * - 限制输出长边像素，避免超大流程图导致 canvas 栅格化过慢甚至超出引擎限制
 * - 任一步骤失败都 reject（不吞掉错误），配合调用方保证不会「无响应」
 */
async function rasterizeSvgToPngBlob(svg: SVGSVGElement, scale: number): Promise<Blob> {
  const w = Math.max(
    1,
    svg.clientWidth || Number.parseFloat(svg.getAttribute("width") ?? "0") || 300,
  );
  const h = Math.max(
    1,
    svg.clientHeight || Number.parseFloat(svg.getAttribute("height") ?? "0") || 150,
  );

  const MAX_EDGE = 2600;
  const longEdge = Math.max(w, h) * scale;
  const effectiveScale = longEdge > MAX_EDGE ? MAX_EDGE / Math.max(w, h) : scale;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const svgText = new XMLSerializer().serializeToString(clone);
  // 用 data: URI 而非 blob: URL 加载 SVG：Mermaid 的文字标签默认用 <foreignObject> 承载 HTML，
  // Chromium 对「含 foreignObject 的 SVG 通过 blob: URL 加载」会把画布标记为“脏”（即使内容完全同源），
  // 导致 toBlob/toDataURL 直接抛 SecurityError；用 data: URI 不受此限制（浏览器已知行为差异）。
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

  const img = await loadImage(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * effectiveScale));
  canvas.height = Math.max(1, Math.round(h * effectiveScale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  // 白底：流程图多为透明背景 SVG，贴到聊天工具等深色背景时需要底色兜底
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("生成图片失败");
  return blob;
}

/**
 * 把 SVG 元素栅格化为 PNG 并写入系统剪贴板（供粘贴到不支持 Markdown/SVG 的地方，如聊天工具、Word）。
 * @param scale 放大倍率，提升清晰度，默认 2x（大图会自动降倍避免过慢）。
 * @throws 失败时抛出真实错误（尽量保留具体原因文案），供上层直接展示，方便定位问题。
 *
 * 关键点：`navigator.clipboard.write()` 必须在用户手势的同步阶段调用，否则部分浏览器/WebView
 * 会因「用户激活态」已过期而静默失败或长时间无响应。这里把耗时的 SVG→PNG 转换放进
 * `ClipboardItem` 接受的 `Promise<Blob>` 里，`write()` 本身在本函数第一步就同步发起。
 */
export async function copySvgAsPngToClipboard(svg: SVGSVGElement, scale = 2): Promise<void> {
  if (typeof ClipboardItem === "undefined") {
    throw new Error("当前环境不支持复制图片（无 ClipboardItem）");
  }
  if (!navigator.clipboard?.write) {
    throw new Error("当前环境不支持复制图片（无 clipboard.write）");
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": rasterizeSvgToPngBlob(svg, scale) }),
    ]);
  } catch (err) {
    console.error("[markmfy] copy diagram as image failed", err);
    throw err;
  }
}

export interface ToolbarMenuItem {
  label: string;
  onClick: () => void | Promise<void>;
}

/**
 * 悬浮小菜单按钮：点击主按钮弹出菜单项列表，点击菜单项/外部/Escape 关闭。
 * 用于「复制内容」这类同一操作有多种输出格式的场景。
 */
export function createToolbarMenuButton(label: string, items: ToolbarMenuItem[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "mm-widget-menu";

  const menu = document.createElement("div");
  menu.className = "mm-widget-menu__list";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const onOutside = (e: MouseEvent): void => {
    if (!(e.target instanceof Node) || !wrap.contains(e.target)) close();
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  function close(): void {
    menu.hidden = true;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKeydown, true);
  }
  function open(): void {
    menu.hidden = false;
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }

  const trigger = createToolbarButton(`${label} \u25be`, () => {
    if (menu.hidden) open();
    else close();
  });
  trigger.classList.add("mm-widget-menu__trigger");

  for (const item of items) {
    const btn = createToolbarButton(item.label, () => {
      close();
      void item.onClick();
    });
    btn.classList.add("mm-widget-menu__item");
    menu.appendChild(btn);
  }

  wrap.append(trigger, menu);
  return wrap;
}
