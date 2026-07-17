import { EditorView, WidgetType } from "@codemirror/view";
import { createToolbarButton, openLightbox } from "./widgetDom";
import { requestBlockSourceEdit } from "./blockSourceEdit";

export { appendInlineMarkdown } from "./widgetDom";
export { TableWidget } from "./tableWidget";
export type { TableCellData } from "./tableWidget";
export { MermaidWidget } from "./mermaidWidget";
export { CodeBlockWidget } from "./codeBlockWidget";
export { MathWidget } from "./mathWidget";

interface ImageWidgetDomState {
  resizeObserver: ResizeObserver | null;
}

const IMAGE_WIDGET_STATE_KEY = "_mmImageWidget";

function setImageWidgetState(dom: HTMLElement, state: ImageWidgetDomState): void {
  (dom as unknown as Record<string, ImageWidgetDomState>)[IMAGE_WIDGET_STATE_KEY] = state;
}

function getImageWidgetState(dom: HTMLElement): ImageWidgetDomState | null {
  return (dom as unknown as Record<string, ImageWidgetDomState | undefined>)[IMAGE_WIDGET_STATE_KEY] ?? null;
}

function updateImageFit(view: EditorView, wrap: HTMLElement, img: HTMLImageElement): void {
  const maxWidth = Math.max(180, view.scrollDOM.clientWidth - 56);
  const maxHeight = Math.max(180, view.scrollDOM.clientHeight - 96);
  wrap.style.maxWidth = `${maxWidth}px`;
  img.style.maxWidth = `${maxWidth}px`;
  img.style.maxHeight = `${maxHeight}px`;
}

/** 任务列表 checkbox，点击时把文档中的 "[ ]"/"[x]" 原地切换。 */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly markerFrom: number,
    readonly markerTo: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.markerFrom === this.markerFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "mm-task-checkbox";
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("change", () => {
      view.dispatch({
        changes: {
          from: this.markerFrom,
          to: this.markerTo,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return box;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** 分割线渲染；双击进入 `---` 源码编辑（事件绑在 Widget 上，避免 posAtCoords 点不中）。 */
export class HrWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: HrWidget): boolean {
    return this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mm-hr-wrap";
    wrap.title = "双击编辑源码";
    wrap.setAttribute("aria-label", "分割线，双击编辑源码");

    const hr = document.createElement("hr");
    hr.className = "mm-hr";
    wrap.appendChild(hr);

    const enterSource = (e: MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const anchor = this.from < this.to ? Math.min(this.from + 1, this.to - 1) : this.from;
      view.dispatch({
        effects: requestBlockSourceEdit.of({ from: this.from, to: this.to }),
        selection: { anchor },
        scrollIntoView: true,
      });
      view.focus();
      view.requestMeasure();
    };

    wrap.addEventListener("dblclick", enterSource);
    return wrap;
  }

  ignoreEvent(): boolean {
    // 事件由 Widget DOM 自己处理（与 Mermaid 一致）；否则编辑器收不到点在 Widget 内的双击
    return true;
  }
}

/** 无序列表符号渲染为统一的圆点。 */
export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "mm-bullet";
    span.textContent = "•";
    return span;
  }
}

/** 图片渲染，src 由外部解析（相对路径 -> Tauri 可访问的资源 URL）。 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  destroy(dom: HTMLElement): void {
    getImageWidgetState(dom)?.resizeObserver?.disconnect();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mm-image-wrap";

    const toolbar = document.createElement("div");
    toolbar.className = "mm-widget-toolbar";
    toolbar.appendChild(
      createToolbarButton("放大", () => {
        const big = document.createElement("img");
        big.src = this.src;
        big.alt = this.alt;
        big.className = "mm-lightbox__img";
        openLightbox(big, this.alt || "图片预览");
      }),
    );

    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "mm-image";
    img.loading = "lazy";
    // 图片是异步加载资源，加载完成/失败前后尺寸会跳变；不主动 requestMeasure
    // 会导致主编辑器块高度缓存过期，点击图片下方内容命中错误的行。
    img.addEventListener("load", () => {
      updateImageFit(view, wrap, img);
      view.requestMeasure();
    });
    img.addEventListener("error", () => {
      wrap.className = "mm-image--error";
      wrap.textContent = `图片加载失败: ${this.alt || this.src}`;
      toolbar.remove();
      img.remove();
      view.requestMeasure();
    });
    img.addEventListener("dblclick", () => {
      const big = document.createElement("img");
      big.src = this.src;
      big.alt = this.alt;
      big.className = "mm-lightbox__img";
      openLightbox(big, this.alt || "图片预览");
    });

    wrap.append(toolbar, img);
    updateImageFit(view, wrap, img);
    const state: ImageWidgetDomState = { resizeObserver: null };
    setImageWidgetState(wrap, state);
    if (typeof ResizeObserver !== "undefined") {
      state.resizeObserver = new ResizeObserver(() => {
        updateImageFit(view, wrap, img);
        view.requestMeasure();
      });
      state.resizeObserver.observe(view.scrollDOM);
    }
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
