import { EditorView, WidgetType } from "@codemirror/view";
import { createToolbarButton, openLightbox } from "./widgetDom";

export { appendInlineMarkdown } from "./widgetDom";
export { TableWidget } from "./tableWidget";
export type { TableCellData } from "./tableWidget";
export { MermaidWidget } from "./mermaidWidget";

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

/** 分割线渲染（与标题保持间距，避免看起来像标题下划线）。 */
export class HrWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "mm-hr";
    return hr;
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

  toDOM(): HTMLElement {
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
    img.addEventListener("error", () => {
      wrap.className = "mm-image--error";
      wrap.textContent = `图片加载失败: ${this.alt || this.src}`;
      toolbar.remove();
      img.remove();
    });
    img.addEventListener("dblclick", () => {
      const big = document.createElement("img");
      big.src = this.src;
      big.alt = this.alt;
      big.className = "mm-lightbox__img";
      openLightbox(big, this.alt || "图片预览");
    });

    wrap.append(toolbar, img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
