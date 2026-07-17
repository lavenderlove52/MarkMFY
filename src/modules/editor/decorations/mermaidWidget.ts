import { EditorView, WidgetType } from "@codemirror/view";
import { createToolbarButton, openLightbox } from "./widgetDom";
import { requestBlockSourceEdit } from "./blockSourceEdit";
import {
  normalizeMermaidPrefs,
  prefsEqual,
  serializeMermaidMeta,
  type MermaidViewPrefs,
} from "./mermaidModel";
import { renderMermaidSvg } from "./mermaidRenderer";

function enterBlockSourceEdit(view: EditorView, from: number, to: number): void {
  view.dispatch({
    effects: requestBlockSourceEdit.of({ from, to }),
    selection: { anchor: from < to ? Math.min(from + 1, to - 1) : from },
    scrollIntoView: true,
  });
  view.focus();
}

function persistMermaidPrefs(
  view: EditorView,
  from: number,
  to: number,
  sourceFence: string,
  prefs: MermaidViewPrefs,
): void {
  const meta = serializeMermaidMeta(prefs);
  let insert = sourceFence.endsWith("\n") ? sourceFence : `${sourceFence}\n`;
  insert += meta;

  const original = view.state.doc.sliceString(from, to);
  const originalEndsWithNl = original.endsWith("\n");
  if (originalEndsWithNl && !insert.endsWith("\n")) insert += "\n";
  if (!originalEndsWithNl && insert.endsWith("\n")) insert = insert.slice(0, -1);

  if (insert === original) return;
  view.dispatch({ changes: { from, to, insert } });
}

/**
 * 读出 SVG 的「设计尺寸」（不受当前 CSS transform 影响）。
 */
function readSvgNaturalSize(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { w: vb.width, h: vb.height };
  }

  const attrW = Number.parseFloat(String(svg.getAttribute("width") ?? "").replace("px", ""));
  const attrH = Number.parseFloat(String(svg.getAttribute("height") ?? "").replace("px", ""));
  if (Number.isFinite(attrW) && attrW > 1 && Number.isFinite(attrH) && attrH > 1) {
    return { w: attrW, h: attrH };
  }

  try {
    const box = svg.getBBox();
    if (box.width > 1 && box.height > 1) {
      return { w: box.width, h: box.height };
    }
  } catch {
    /* ignore */
  }

  return {
    w: Math.max(svg.clientWidth, 320),
    h: Math.max(svg.clientHeight, 180),
  };
}

/**
 * Mermaid 预览：
 * - 默认按编辑器当前可用宽高等比缩放，优先完整展示整张图
 * - 放大缩小是相对适配态的倍率；放大后溢出可平移查看
 * - 拦截 Ctrl+滚轮在画布内缩放
 */
export class MermaidWidget extends WidgetType {
  private readonly prefs: MermaidViewPrefs;
  private readonly fenceText: string;

  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    prefs: MermaidViewPrefs | null = null,
    fenceText = "",
  ) {
    super();
    this.prefs = normalizeMermaidPrefs(prefs);
    this.fenceText = fenceText;
  }

  eq(other: MermaidWidget): boolean {
    return (
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to &&
      prefsEqual(other.prefs, this.prefs)
    );
  }

  /** 未测量前给 CM 一个占位高度，避免为量高而立刻挂载并渲染全部图。 */
  get estimatedHeight(): number {
    return 180;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mm-mermaid";
    wrap.title = "字号一致 · 滚轮缩放(Ctrl) · 拖拽平移";

    // 使用文档里的相对 zoom；旧版绝对 scale 已在 normalize 时丢弃
    let prefs = normalizeMermaidPrefs(this.prefs);
    let naturalW = 0;
    let naturalH = 0;
    let fitScale = 1;
    let canvasH = 120;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panAtStartX = 0;
    let panAtStartY = 0;
    let fittedOnce = false;

    const toolbar = document.createElement("div");
    toolbar.className = "mm-widget-toolbar";

    const viewport = document.createElement("div");
    viewport.className = "mm-mermaid__viewport";

    const stage = document.createElement("div");
    stage.className = "mm-mermaid__stage";

    const canvas = document.createElement("div");
    canvas.className = "mm-mermaid__canvas";
    canvas.textContent = "渲染流程图中…";

    const status = document.createElement("span");
    status.className = "mm-mermaid__status";

    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const displayScale = (): number => fitScale * prefs.zoom;

    const availableViewportWidth = (): number => {
      const scrollWidth = view.scrollDOM.clientWidth - 56;
      const wrapWidth = wrap.clientWidth > 0 ? wrap.clientWidth : scrollWidth;
      return Math.max(240, Math.min(scrollWidth, wrapWidth));
    };

    const availableViewportHeight = (): number => {
      const editorHeight = view.scrollDOM.clientHeight - 120;
      const windowHeight = window.innerHeight * 0.78;
      return Math.max(160, Math.min(editorHeight, windowHeight, 1200));
    };

    const clampPan = (): void => {
      const s = displayScale();
      const contentW = naturalW * s;
      const contentH = naturalH * s;
      const viewportW = Math.max(viewport.clientWidth, 1);

      // 比画布小则居中；比画布大则可在范围内平移
      if (contentW <= viewportW) {
        panX = (viewportW - contentW) / 2;
      } else {
        const minX = viewportW - contentW;
        panX = Math.min(0, Math.max(minX, panX));
      }
      if (contentH <= canvasH) {
        panY = (canvasH - contentH) / 2;
      } else {
        const minY = canvasH - contentH;
        panY = Math.min(0, Math.max(minY, panY));
      }
    };

    const syncView = (opts?: { measure?: boolean }): void => {
      // 画布宽度跟容器；高度=min(图高, 上限)。stage 绝对定位，不参与布局测量。
      viewport.style.width = "100%";
      viewport.style.height = `${Math.max(48, canvasH)}px`;
      stage.style.width = `${Math.max(1, naturalW)}px`;
      stage.style.height = `${Math.max(1, naturalH)}px`;
      clampPan();
      stage.style.transform = `translate(${panX}px, ${panY}px) scale(${displayScale()})`;
      status.textContent = `${Math.round(prefs.zoom * 100)}%`;
      if (opts?.measure !== false) {
        view.requestMeasure();
      }
    };

    const recomputeFit = (): void => {
      if (naturalW < 2 || naturalH < 2) {
        fitScale = 1;
        canvasH = 120;
        return;
      }

      const maxW = availableViewportWidth();
      const maxH = availableViewportHeight();
      const nextFit = Math.min(1, maxW / naturalW, maxH / naturalH);
      fitScale = Number.isFinite(nextFit) && nextFit > 0 ? nextFit : 1;

      const scaledH = naturalH * displayScale();
      canvasH = Math.max(48, Math.min(Math.ceil(scaledH), maxH));
    };

    const savePrefs = (): void => {
      if (!this.fenceText) return;
      // 持久化相对 zoom；fit 由当前窗口实时计算，首次 zoom=1 不写脏数据
      persistMermaidPrefs(view, this.from, this.to, this.fenceText, prefs);
    };

    const scheduleSavePrefs = (): void => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        savePrefs();
      }, 450);
    };

    const openFull = (): void => {
      const clone = canvas.cloneNode(true) as HTMLElement;
      clone.classList.add("mm-lightbox__diagram");
      openLightbox(clone, "Mermaid 预览");
    };

    const setZoom = (next: number): void => {
      const prev = displayScale();
      const viewportW = Math.max(viewport.clientWidth, 1);
      const cx = viewportW / 2;
      const cy = canvasH / 2;
      const contentX = (cx - panX) / Math.max(prev, 0.001);
      const contentY = (cy - panY) / Math.max(prev, 0.001);

      prefs = normalizeMermaidPrefs({ ...prefs, zoom: next });
      recomputeFit();
      const nextScale = displayScale();
      panX = cx - contentX * nextScale;
      panY = cy - contentY * nextScale;
      syncView();
      scheduleSavePrefs();
    };

    const applyAfterRender = (): void => {
      const svg = canvas.querySelector("svg");
      if (!svg) return;

      // 用 viewBox/属性读设计尺寸（不受 CSS transform 影响）
      stage.style.transform = "none";
      const size = readSvgNaturalSize(svg);
      naturalW = size.w;
      naturalH = size.h;

      svg.setAttribute("width", String(naturalW));
      svg.setAttribute("height", String(naturalH));
      svg.style.width = `${naturalW}px`;
      svg.style.height = `${naturalH}px`;
      svg.style.maxWidth = "none";

      recomputeFit();
      if (!fittedOnce) {
        panX = 0;
        panY = 0;
        fittedOnce = true;
      }
      syncView();
    };

    let disposed = false;
    let renderStarted = false;

    const paintSvg = async (): Promise<void> => {
      canvas.textContent = "渲染流程图中…";
      // 先给画布一个合理占位，避免插入巨型 SVG 时 CM 量到整图高度
      viewport.style.height = "120px";
      try {
        const svgHtml = await renderMermaidSvg(this.source, prefs.fontSize);
        if (disposed) return;
        canvas.innerHTML = svgHtml;
        // 同步立刻适配：插入后若等 rAF，中间一帧会按 SVG 原始高度撑爆 widget
        applyAfterRender();
        // 下一帧用真实 clientWidth 再校准一次（首屏宽度有时尚未稳定）
        requestAnimationFrame(() => {
          if (disposed) return;
          recomputeFit();
          syncView();
        });
      } catch (err) {
        if (disposed) return;
        wrap.classList.add("mm-mermaid--error");
        canvas.textContent = `Mermaid 渲染失败：${err instanceof Error ? err.message : String(err)}`;
      }
    };

    const startRender = (): void => {
      if (renderStarted || disposed) return;
      renderStarted = true;
      void paintSvg();
    };

    const setFontSize = async (next: number): Promise<void> => {
      prefs = normalizeMermaidPrefs({ ...prefs, fontSize: next });
      fittedOnce = false;
      renderStarted = true;
      await paintSvg();
      if (!disposed) savePrefs();
    };

    toolbar.append(
      createToolbarButton("缩小", () => {
        setZoom(prefs.zoom - 0.15);
      }),
      createToolbarButton("放大", () => {
        setZoom(prefs.zoom + 0.15);
      }),
      createToolbarButton("字号-", () => {
        void setFontSize(prefs.fontSize - 2);
      }),
      createToolbarButton("字号+", () => {
        void setFontSize(prefs.fontSize + 2);
      }),
      createToolbarButton("复位", () => {
        prefs = normalizeMermaidPrefs({ ...prefs, zoom: 1 });
        panX = 0;
        panY = 0;
        recomputeFit();
        syncView();
        scheduleSavePrefs();
      }),
      createToolbarButton("编辑", () => {
        enterBlockSourceEdit(view, this.from, this.to);
      }),
      createToolbarButton("全屏", openFull),
      status,
    );

    viewport.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".mm-widget-btn")) return;
      if (e.button !== 0) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panAtStartX = panX;
      panAtStartY = panY;
      viewport.classList.add("mm-mermaid__viewport--dragging");
      e.preventDefault();
    });

    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      panX = panAtStartX + (e.clientX - dragStartX);
      panY = panAtStartY + (e.clientY - dragStartY);
      syncView({ measure: false });
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove("mm-mermaid__viewport--dragging");
      syncView({ measure: true });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        setZoom(prefs.zoom + (e.deltaY > 0 ? -0.12 : 0.12));
        return;
      }
      const s = displayScale();
      const overflow =
        naturalW * s > viewport.clientWidth + 1 || naturalH * s > canvasH + 1;
      if (overflow) {
        e.preventDefault();
        e.stopPropagation();
        panX -= e.deltaX;
        panY -= e.deltaY;
        syncView({ measure: false });
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false, capture: true });

    wrap.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".mm-widget-btn")) return;
      e.preventDefault();
      enterBlockSourceEdit(view, this.from, this.to);
    });

    stage.appendChild(canvas);
    viewport.appendChild(stage);
    wrap.append(toolbar, viewport);

    canvas.textContent = "流程图加载中…";
    viewport.style.height = "120px";

    // 仅进入视口（含附近预加载）时才真正 render，避免打开文件时 11 张图一起算布局
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                io?.disconnect();
                startRender();
              }
            },
            { root: null, rootMargin: "240px 0px", threshold: 0.01 },
          )
        : null;
    if (io) {
      io.observe(wrap);
      requestAnimationFrame(() => {
        if (disposed || renderStarted) return;
        const rect = wrap.getBoundingClientRect();
        if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight + 240) {
          io.disconnect();
          startRender();
        }
      });
    } else {
      startRender();
    }

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (naturalW < 2) return;
            recomputeFit();
            syncView({ measure: true });
          })
        : null;
    ro?.observe(wrap);

    const cleanup = (): void => {
      if (disposed) return;
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      wrap.removeEventListener("wheel", onWheel, true);
      io?.disconnect();
      ro?.disconnect();
    };
    (wrap as HTMLElement & { __mmCleanup?: () => void }).__mmCleanup = cleanup;

    return wrap;
  }

  destroy(dom: HTMLElement): void {
    const host = dom as HTMLElement & { __mmCleanup?: () => void };
    host.__mmCleanup?.();
    delete host.__mmCleanup;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
