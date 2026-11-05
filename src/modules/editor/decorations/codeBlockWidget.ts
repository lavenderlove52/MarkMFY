import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, WidgetType } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { markmfyHighlightStyle } from "../language/highlight";
import { copyTextToClipboard, createToolbarButton } from "./widgetDom";
import { requestBlockSourceEdit } from "./blockSourceEdit";
import { showToast, toastError } from "../../../notify";
import {
  CODE_BLOCK_LANG_OPTIONS,
  fenceLangForSelect,
  matchFenceTrailingNewline,
  normalizeCodeBody,
  normalizeFenceLang,
  resolveLanguageDescription,
  serializeFencedCode,
} from "./codeBlockModel";

interface NestedState {
  parent: EditorView;
  nested: EditorView;
  langComp: Compartment;
  from: number;
  to: number;
  lang: string;
  debounce: ReturnType<typeof setTimeout> | null;
  suppressWrite: boolean;
  destroyed: boolean;
  resizeObserver: ResizeObserver | null;
}

const STATE_KEY = "_mmCodeBlock";

function getState(dom: HTMLElement): NestedState | null {
  const s = (dom as unknown as Record<string, NestedState | undefined>)[STATE_KEY];
  return s ?? null;
}

function setState(dom: HTMLElement, state: NestedState): void {
  (dom as unknown as Record<string, NestedState>)[STATE_KEY] = state;
}

async function applyLanguage(state: NestedState, lang: string): Promise<void> {
  const desc = resolveLanguageDescription(lang);
  let ext: Extension[] = [];
  if (desc) {
    try {
      const support = await desc.load();
      if (state.destroyed) return;
      ext = [support];
    } catch (err) {
      console.warn("[markmfy] failed to load code language", lang, err);
    }
  }
  if (state.destroyed) return;
  state.nested.dispatch({
    effects: state.langComp.reconfigure(ext),
  });
}

function persistFence(state: NestedState): void {
  if (state.destroyed || state.suppressWrite) return;
  const body = normalizeCodeBody(state.nested.state.doc.toString());
  let insert = serializeFencedCode(state.lang, body);
  const original = state.parent.state.doc.sliceString(state.from, state.to);
  insert = matchFenceTrailingNewline(original, insert);
  if (insert === original) return;
  state.parent.dispatch({
    changes: { from: state.from, to: state.to, insert },
  });
}

function schedulePersist(state: NestedState): void {
  if (state.debounce) clearTimeout(state.debounce);
  state.debounce = setTimeout(() => {
    state.debounce = null;
    persistFence(state);
  }, 120);
}

function buildNestedExtensions(stateRef: { current: NestedState | null }, langComp: Compartment): Extension[] {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    langComp.of([]),
    syntaxHighlighting(markmfyHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        fontSize: "0.92em",
        fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
        backgroundColor: "transparent",
      },
      ".cm-content": {
        fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
        padding: "4px 0",
      },
      ".cm-gutters": { display: "none" },
      "&.cm-focused": { outline: "none" },
    }),
    EditorView.updateListener.of((update) => {
      const state = stateRef.current;
      if (!state || state.destroyed || state.suppressWrite) return;
      if (update.docChanged) schedulePersist(state);
    }),
  ];
}

/**
 * 普通围栏代码块：内嵌 CM 直编 + 语言下拉高亮，默认不露出 ```。
 */
export class CodeBlockWidget extends WidgetType {
  readonly lang: string;
  readonly body: string;

  constructor(
    lang: string,
    body: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
    this.lang = normalizeFenceLang(lang);
    this.body = normalizeCodeBody(body);
  }

  eq(other: CodeBlockWidget): boolean {
    return (
      other.from === this.from &&
      other.to === this.to &&
      other.lang === this.lang &&
      other.body === this.body
    );
  }

  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    void _view;
    const state = getState(dom);
    if (!state || state.destroyed) return false;

    state.from = this.from;
    state.to = this.to;

    if (state.lang !== this.lang) {
      state.lang = this.lang;
      const select = dom.querySelector(".mm-code-block__lang") as HTMLSelectElement | null;
      if (select) select.value = fenceLangForSelect(this.lang);
      void applyLanguage(state, this.lang);
    }

    if (!state.nested.hasFocus) {
      const cur = normalizeCodeBody(state.nested.state.doc.toString());
      if (cur !== this.body) {
        state.suppressWrite = true;
        state.nested.dispatch({
          changes: { from: 0, to: state.nested.state.doc.length, insert: this.body },
        });
        state.suppressWrite = false;
      }
    }

    return true;
  }

  /** 未测量前给主编辑器一个占位高度，减小首次挂载时的跳变。 */
  get estimatedHeight(): number {
    const lines = Math.max(1, this.body.split("\n").length);
    return 28 + lines * 20;
  }

  destroy(dom: HTMLElement): void {
    const state = getState(dom);
    if (!state) return;
    state.destroyed = true;
    if (state.debounce) clearTimeout(state.debounce);
    state.resizeObserver?.disconnect();
    state.nested.destroy();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mm-code-block";
    wrap.setAttribute("contenteditable", "false");

    const toolbar = document.createElement("div");
    toolbar.className = "mm-widget-toolbar mm-code-block__toolbar";

    const select = document.createElement("select");
    select.className = "mm-code-block__lang";
    select.title = "代码语言";
    const selectValue = fenceLangForSelect(this.lang);
    const known = new Set(CODE_BLOCK_LANG_OPTIONS.map((o) => o.value));
    for (const opt of CODE_BLOCK_LANG_OPTIONS) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    }
    if (selectValue && !known.has(selectValue)) {
      const option = document.createElement("option");
      option.value = selectValue;
      option.textContent = selectValue;
      select.appendChild(option);
    }
    select.value = selectValue;

    toolbar.append(
      select,
      createToolbarButton("复制源码", () => {
        void copyTextToClipboard(serializeFencedCode(this.lang, this.body)).then((ok) => {
          if (ok) showToast("已复制源码", "success");
          else toastError(new Error("复制失败"), "复制源码失败");
        });
      }),
      createToolbarButton("复制内容", () => {
        void copyTextToClipboard(this.body).then((ok) => {
          if (ok) showToast("已复制内容", "success");
          else toastError(new Error("复制失败"), "复制内容失败");
        });
      }),
      createToolbarButton("源码编辑", () => {
        const state = getState(wrap);
        const from = state?.from ?? this.from;
        const to = state?.to ?? this.to;
        if (state?.debounce) {
          clearTimeout(state.debounce);
          state.debounce = null;
          persistFence(state);
        }
        view.dispatch({
          effects: requestBlockSourceEdit.of({ from, to }),
          selection: {
            anchor: from < to ? Math.min(from + 1, to - 1) : from,
          },
          scrollIntoView: true,
        });
        view.focus();
      }),
    );

    const editorHost = document.createElement("div");
    editorHost.className = "mm-code-block__editor";

    wrap.append(toolbar, editorHost);

    const langComp = new Compartment();
    const stateRef: { current: NestedState | null } = { current: null };

    const nested = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: this.body,
        extensions: buildNestedExtensions(stateRef, langComp),
      }),
    });

    const state: NestedState = {
      parent: view,
      nested,
      langComp,
      from: this.from,
      to: this.to,
      lang: this.lang,
      debounce: null,
      suppressWrite: false,
      destroyed: false,
      resizeObserver: null,
    };
    stateRef.current = state;
    setState(wrap, state);

    // 内嵌编辑器的行数/换行随时可能变化（输入换行、粘贴多行、切语言后换行宽度变化），
    // 这些变化只发生在 widget 内部 DOM，主编辑器的块高度缓存不会自动感知——
    // 必须显式 requestMeasure，否则点击 widget 下方内容会命中错误的行（CM6 官方要求）。
    if (typeof ResizeObserver !== "undefined") {
      state.resizeObserver = new ResizeObserver(() => {
        if (state.destroyed) return;
        view.requestMeasure();
      });
      state.resizeObserver.observe(wrap);
    }

    select.addEventListener("mousedown", (e) => e.stopPropagation());
    select.addEventListener("change", () => {
      const next = normalizeFenceLang(select.value);
      state.lang = next;
      void applyLanguage(state, next);
      persistFence(state);
    });

    wrap.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".mm-code-block__lang, .mm-widget-btn")) return;
      e.stopPropagation();
    });

    void applyLanguage(state, this.lang);

    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    if (!(event.target instanceof Element)) return false;
    return !!event.target.closest(".mm-code-block");
  }
}
