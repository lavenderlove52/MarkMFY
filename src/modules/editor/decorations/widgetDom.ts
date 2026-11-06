import type { EditorView } from "@codemirror/view";

let closeActiveLightbox: (() => void) | null = null;

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
  closeActiveLightbox?.();
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
  const actions = document.createElement("div");
  actions.className = "mm-lightbox__actions";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "mm-lightbox__close";
  closeBtn.textContent = "关闭";
  actions.appendChild(closeBtn);
  bar.append(label, actions);

  const body = document.createElement("div");
  body.className = "mm-lightbox__body";
  body.appendChild(content);
  const image = content instanceof HTMLImageElement ? content : null;
  let onZoomIn: (() => void) | null = null;
  let onZoomOut: (() => void) | null = null;
  let onZoomReset: (() => void) | null = null;
  let cleanupLightbox: () => void = () => {};
  if (image) {
    panel.classList.add("mm-lightbox__panel--image");
    body.classList.add("mm-lightbox__body--image");
    const controls = document.createElement("div");
    controls.className = "mm-lightbox__zoom";
    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.className = "mm-lightbox__zoom-btn";
    zoomOut.textContent = "−";
    zoomOut.title = "缩小";
    zoomOut.setAttribute("aria-label", "缩小图片");
    const zoomValue = document.createElement("button");
    zoomValue.type = "button";
    zoomValue.className = "mm-lightbox__zoom-value";
    zoomValue.textContent = "适应";
    zoomValue.title = "恢复适应窗口";
    zoomValue.setAttribute("aria-label", "恢复适应窗口");
    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.className = "mm-lightbox__zoom-btn";
    zoomIn.textContent = "+";
    zoomIn.title = "放大";
    zoomIn.setAttribute("aria-label", "放大图片");
    controls.append(zoomOut, zoomValue, zoomIn);
    actions.prepend(controls);

    let zoom = 1;
    let fitScale = 1;
    const clampRatio = (value: number): number => Math.max(0, Math.min(1, value));
    const applyZoom = (next: number, pointer?: { clientX: number; clientY: number }): void => {
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      if (!w || !h) return;
      const imageRect = image.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      if (imageRect.width <= 0 || imageRect.height <= 0) return;
      const pointerOnImage =
        pointer != null &&
        pointer.clientX >= imageRect.left &&
        pointer.clientX <= imageRect.right &&
        pointer.clientY >= imageRect.top &&
        pointer.clientY <= imageRect.bottom;
      const anchorClientX = pointerOnImage ? pointer.clientX : imageRect.left + imageRect.width / 2;
      const anchorClientY = pointerOnImage ? pointer.clientY : imageRect.top + imageRect.height / 2;
      const ratioX = clampRatio((anchorClientX - imageRect.left) / imageRect.width);
      const ratioY = clampRatio((anchorClientY - imageRect.top) / imageRect.height);
      const viewportX = anchorClientX - bodyRect.left;
      const viewportY = anchorClientY - bodyRect.top;
      const availableW = Math.max(120, body.clientWidth - 32);
      const availableH = Math.max(120, body.clientHeight - 32);
      fitScale = Math.min(1, availableW / w, availableH / h);
      zoom = Math.max(0.25, Math.min(4, next));
      const scale = fitScale * zoom;
      image.style.maxWidth = "none";
      image.style.maxHeight = "none";
      image.style.width = `${Math.max(1, Math.round(w * scale))}px`;
      image.style.height = `${Math.max(1, Math.round(h * scale))}px`;
      zoomValue.textContent = `${Math.round(scale * 100)}%`;
      const nextRect = image.getBoundingClientRect();
      const nextBodyRect = body.getBoundingClientRect();
      body.scrollLeft += nextRect.left + ratioX * nextRect.width - (nextBodyRect.left + viewportX);
      body.scrollTop += nextRect.top + ratioY * nextRect.height - (nextBodyRect.top + viewportY);
    };
    const resetZoom = (): void => applyZoom(1);
    onZoomIn = () => applyZoom(zoom * 1.25);
    onZoomOut = () => applyZoom(zoom / 1.25);
    onZoomReset = resetZoom;
    zoomIn.addEventListener("click", () => onZoomIn?.());
    zoomOut.addEventListener("click", () => onZoomOut?.());
    zoomValue.addEventListener("click", resetZoom);
    body.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        applyZoom(zoom * Math.exp(-event.deltaY * 0.0015), event);
      },
      { passive: false },
    );
    body.addEventListener("dblclick", (event) => {
      if (event.target !== image) return;
      applyZoom(zoom > 1.001 ? 1 : 1 / Math.max(fitScale, 0.01), event);
    });

    image.draggable = false;
    let dragPointerId: number | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartScrollLeft = 0;
    let dragStartScrollTop = 0;
    let moved = false;
    const endDrag = (event: PointerEvent): void => {
      if (dragPointerId !== event.pointerId) return;
      dragPointerId = null;
      moved = false;
      body.classList.remove("mm-lightbox__body--dragging");
      if (image.hasPointerCapture(event.pointerId)) {
        image.releasePointerCapture(event.pointerId);
      }
    };
    image.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragStartScrollLeft = body.scrollLeft;
      dragStartScrollTop = body.scrollTop;
      moved = false;
      image.setPointerCapture(event.pointerId);
    });
    image.addEventListener("pointermove", (event) => {
      if (dragPointerId !== event.pointerId) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (!moved && Math.hypot(dx, dy) > 3) {
        moved = true;
        body.classList.add("mm-lightbox__body--dragging");
        event.preventDefault();
      }
      if (!moved) return;
      body.scrollLeft = dragStartScrollLeft - dx;
      body.scrollTop = dragStartScrollTop - dy;
    });
    image.addEventListener("pointerup", endDrag);
    image.addEventListener("pointercancel", endDrag);

    let resizeFrame: number | null = null;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (resizeFrame != null) return;
            resizeFrame = requestAnimationFrame(() => {
              resizeFrame = null;
              applyZoom(zoom);
            });
          });
    resizeObserver?.observe(panel);
    cleanupLightbox = () => {
      resizeObserver?.disconnect();
      if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
    };

    const initializeZoom = (): void => {
      requestAnimationFrame(resetZoom);
    };
    if (image.complete) initializeZoom();
    else image.addEventListener("load", initializeZoom, { once: true });
  }

  panel.append(bar, body);
  overlay.appendChild(panel);

  const close = (): void => {
    cleanupLightbox();
    overlay.remove();
    window.removeEventListener("keydown", onKey);
    if (closeActiveLightbox === close) closeActiveLightbox = null;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
    else if (e.key === "+" || e.key === "=") onZoomIn?.();
    else if (e.key === "-") onZoomOut?.();
    else if (e.key === "0") onZoomReset?.();
  };
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  closeActiveLightbox = close;
}

export function createToolbarButton(
  label: string,
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
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
  /** 打开菜单时用于标记当前选项。 */
  isActive?: () => boolean;
}

const toolbarMenuDisposers = new WeakMap<HTMLElement, () => void>();

/** 主动清理菜单可能注册在 document 上的临时监听器。 */
export function disposeToolbarMenu(menu: HTMLElement): void {
  toolbarMenuDisposers.get(menu)?.();
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
  const buttons: HTMLButtonElement[] = [];

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
    for (const [index, item] of items.entries()) {
      const button = buttons[index];
      if (!button) continue;
      const active = item.isActive?.() ?? false;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    }
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
    if (item.isActive) {
      btn.setAttribute("role", "menuitemradio");
      btn.setAttribute("aria-checked", String(item.isActive()));
    } else {
      btn.setAttribute("role", "menuitem");
    }
    menu.appendChild(btn);
    buttons.push(btn);
  }

  wrap.append(trigger, menu);
  toolbarMenuDisposers.set(wrap, close);
  return wrap;
}
