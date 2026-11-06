import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap, lineNumbers, WidgetType } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { codeBlockHighlightStyle } from "../language/highlight";
import {
  copyTextToClipboard,
  createToolbarButton,
  createToolbarMenuButton,
  disposeToolbarMenu,
} from "./widgetDom";
import { requestBlockSourceEdit } from "./blockSourceEdit";
import { showToast, toastError } from "../../../notify";
import {
  CODE_BLOCK_LANG_OPTIONS,
  CODE_BLOCK_THEME_OPTIONS,
  DEFAULT_CODE_BLOCK_THEME,
  fenceLangForSelect,
  matchFenceTrailingNewline,
  normalizeCodeBody,
  normalizeFenceLang,
  resolveLanguageDescription,
  serializeFencedCode,
  type CodeBlockTheme,
} from "./codeBlockModel";

interface NestedState {
  parent: EditorView;
  nested: EditorView;
  langComp: Compartment;
  from: number;
  to: number;
  lang: string;
  theme: CodeBlockTheme;
  languageLoadToken: number;
  debounce: ReturnType<typeof setTimeout> | null;
  suppressWrite: boolean;
  destroyed: boolean;
  resizeObserver: ResizeObserver | null;
  measureFrame: number | null;
}

const STATE_KEY = "_mmCodeBlock";
const activeCodeBlocks = new Set<NestedState>();

/** 请求焦点进入刚创建的代码块正文；值是通过块内坐标定位目标 Widget。 */
export const requestCodeBlockBodyFocus = StateEffect.define<number | null>();

export const codeBlockBodyFocusField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(requestCodeBlockBodyFocus)) value = effect.value;
    }
    return value;
  },
});

/** 标记代码块前由临时输入层创建的段落，空掉后可自动移除。 */
export const markTemporaryLeadingParagraph = StateEffect.define<boolean>();

export const temporaryLeadingParagraphField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(markTemporaryLeadingParagraph)) value = effect.value;
    }
    return value;
  },
});

function getState(dom: HTMLElement): NestedState | null {
  const s = (dom as unknown as Record<string, NestedState | undefined>)[STATE_KEY];
  return s ?? null;
}

function setState(dom: HTMLElement, state: NestedState): void {
  (dom as unknown as Record<string, NestedState>)[STATE_KEY] = state;
}

async function applyLanguage(state: NestedState, lang: string): Promise<void> {
  const loadToken = ++state.languageLoadToken;
  const desc = resolveLanguageDescription(lang);
  let ext: Extension[] = [];
  if (desc) {
    try {
      const support = await desc.load();
      if (state.destroyed || state.lang !== lang || state.languageLoadToken !== loadToken) return;
      ext = [support];
    } catch (err) {
      console.warn("[markmfy] failed to load code language", lang, err);
    }
  }
  if (state.destroyed || state.lang !== lang || state.languageLoadToken !== loadToken) return;
  state.nested.dispatch({
    effects: state.langComp.reconfigure(ext),
  });
}

function persistFence(state: NestedState): void {
  if (state.destroyed || state.suppressWrite) return;
  const body = normalizeCodeBody(state.nested.state.doc.toString());
  let insert = serializeFencedCode(state.lang, body, state.theme);
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
  }, 220);
}

function flushPendingCodeBlock(state: NestedState): void {
  if (state.destroyed || !state.debounce) return;
  clearTimeout(state.debounce);
  state.debounce = null;
  persistFence(state);
}

/** 在切换标签、保存或卸载前，把仍在防抖等待中的代码块内容同步回外层文档。 */
export function flushPendingCodeBlockEdits(parent: EditorView): void {
  for (const state of activeCodeBlocks) {
    if (state.parent === parent) flushPendingCodeBlock(state);
  }
}

/**
 * 先补全当前围栏，再在主编辑器中于代码块下方创建一个空白段落并聚焦。
 * 未闭合围栏会被解析到文档末尾，若不主动补边界，用户无法把光标移出 Widget。
 */
function moveBelowCodeBlock(state: NestedState): void {
  if (state.destroyed) return;
  if (state.debounce) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }

  const body = normalizeCodeBody(state.nested.state.doc.toString());
  let insert = serializeFencedCode(state.lang, body, state.theme);
  const doc = state.parent.state.doc;
  const needsBlankLine =
    state.to >= doc.length || state.parent.state.doc.sliceString(state.to, state.to + 1) !== "\n";
  if (needsBlankLine) insert += "\n";

  const target = state.from + insert.length - (needsBlankLine ? 1 : 0);
  state.suppressWrite = true;
  state.parent.dispatch({
    changes: { from: state.from, to: state.to, insert },
    selection: { anchor: target },
    scrollIntoView: true,
  });
  state.suppressWrite = false;
  state.parent.focus();
}

function buildNestedExtensions(
  stateRef: { current: NestedState | null },
  langComp: Compartment,
): Extension[] {
  const runHistory = (view: EditorView, direction: "undo" | "redo"): boolean => {
    const state = stateRef.current;
    if (!state) return false;
    const nestedDepth = direction === "undo" ? undoDepth(view.state) : redoDepth(view.state);
    if (nestedDepth > 0) return direction === "undo" ? undo(view) : redo(view);

    // 代码块刚生成时，围栏本身属于外层文档历史；内嵌编辑器没有历史可撤销时，
    // 把快捷键交给外层，才能一次撤销代码块的创建。
    state.parent.focus();
    return direction === "undo" ? undo(state.parent) : redo(state.parent);
  };

  return [
    history(),
    lineNumbers(),
    keymap.of([
      {
        key: "Mod-z",
        preventDefault: true,
        run: (view) => runHistory(view, "undo"),
      },
      {
        key: "Mod-Shift-z",
        preventDefault: true,
        run: (view) => runHistory(view, "redo"),
      },
      {
        key: "Mod-y",
        preventDefault: true,
        run: (view) => runHistory(view, "redo"),
      },
      {
        key: "Mod-Enter",
        preventDefault: true,
        run: () => {
          const state = stateRef.current;
          if (!state) return false;
          moveBelowCodeBlock(state);
          return true;
        },
      },
      {
        key: "Escape",
        preventDefault: true,
        run: () => {
          const state = stateRef.current;
          if (!state) return false;
          moveBelowCodeBlock(state);
          return true;
        },
      },
      {
        key: "ArrowDown",
        run: (view) => {
          const state = stateRef.current;
          if (!state || !view.state.selection.main.empty) return false;
          const line = view.state.doc.lineAt(view.state.selection.main.head);
          if (line.number !== view.state.doc.lines) return false;
          moveBelowCodeBlock(state);
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    langComp.of([]),
    syntaxHighlighting(codeBlockHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        fontSize: "0.92em",
        fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
        backgroundColor: "transparent",
        color: "var(--mm-code-text)",
        caretColor: "var(--mm-code-accent)",
      },
      ".cm-content": {
        fontFamily: "var(--mm-font-mono, Consolas, 'Courier New', monospace)",
        maxWidth: "none",
        minHeight: "0",
        padding: "14px 16px 18px 0",
      },
      ".cm-line": {
        padding: "0 0 0 18px",
      },
      ".cm-gutters": {
        display: "block",
        background: "transparent",
        border: "none",
        color: "var(--mm-code-muted)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "54px",
        padding: "0 16px 0 10px",
        textAlign: "right",
      },
      "&.cm-focused": { outline: "none" },
    }),
    EditorView.updateListener.of((update) => {
      const state = stateRef.current;
      if (!state || state.destroyed || state.suppressWrite) return;
      if (update.docChanged) schedulePersist(state);
    }),
    EditorView.domEventHandlers({
      blur() {
        const state = stateRef.current;
        if (state) flushPendingCodeBlock(state);
        return false;
      },
    }),
  ];
}

/**
 * 普通围栏代码块：内嵌 CM 直编 + 语言/主题菜单，默认不露出 ```。
 */
export class CodeBlockWidget extends WidgetType {
  readonly lang: string;
  readonly body: string;
  readonly theme: CodeBlockTheme;

  constructor(
    lang: string,
    body: string,
    readonly from: number,
    readonly to: number,
    theme: CodeBlockTheme = DEFAULT_CODE_BLOCK_THEME,
  ) {
    super();
    this.lang = normalizeFenceLang(lang);
    this.body = normalizeCodeBody(body);
    this.theme = CODE_BLOCK_THEME_OPTIONS.some((option) => option.value === theme)
      ? theme
      : DEFAULT_CODE_BLOCK_THEME;
  }

  eq(other: CodeBlockWidget): boolean {
    return (
      other.from === this.from &&
      other.to === this.to &&
      other.lang === this.lang &&
      other.body === this.body &&
      other.theme === this.theme
    );
  }

  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    void _view;
    const state = getState(dom);
    if (!state || state.destroyed) return false;

    state.from = this.from;
    state.to = this.to;
    state.theme = this.theme;
    dom.dataset.codeTheme = this.theme;

    if (state.lang !== this.lang) {
      state.lang = this.lang;
      const trigger = dom.querySelector(
        ".mm-code-block__lang-menu .mm-widget-menu__trigger",
      ) as HTMLButtonElement | null;
      if (trigger) {
        const value = fenceLangForSelect(this.lang);
        const label =
          CODE_BLOCK_LANG_OPTIONS.find((option) => option.value === value)?.label ??
          (value || "Plain Text");
        trigger.textContent = `${label} ▾`;
      }
      void applyLanguage(state, this.lang);
    }

    const themeTrigger = dom.querySelector(
      ".mm-code-block__theme-menu .mm-widget-menu__trigger",
    ) as HTMLButtonElement | null;
    if (themeTrigger) {
      const label =
        CODE_BLOCK_THEME_OPTIONS.find((option) => option.value === this.theme)?.label ??
        "Night Owl";
      themeTrigger.textContent = `${label} ▾`;
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
    activeCodeBlocks.delete(state);
    if (state.debounce) clearTimeout(state.debounce);
    for (const menu of dom.querySelectorAll<HTMLElement>(".mm-widget-menu")) {
      disposeToolbarMenu(menu);
    }
    if (state.measureFrame != null) cancelAnimationFrame(state.measureFrame);
    state.resizeObserver?.disconnect();
    state.nested.destroy();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mm-code-block";
    wrap.dataset.codeTheme = this.theme;
    wrap.setAttribute("contenteditable", "false");

    if (this.from === 0) {
      const aboveInput = document.createElement("input");
      aboveInput.type = "text";
      aboveInput.className = "mm-code-block__above";
      aboveInput.setAttribute("aria-label", "在代码块上方输入");
      aboveInput.spellcheck = false;
      aboveInput.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      let committed = false;
      const commitLeadingInput = (): void => {
        if (committed) return;
        const text = aboveInput.value;
        if (!text) {
          aboveInput.blur();
          return;
        }
        committed = true;
        view.dispatch({
          changes: { from: 0, insert: `${text}\n` },
          selection: { anchor: text.length },
          effects: markTemporaryLeadingParagraph.of(true),
          scrollIntoView: true,
        });
        view.focus();
      };
      aboveInput.addEventListener("input", (event) => {
        if ((event as InputEvent).isComposing) return;
        commitLeadingInput();
      });
      aboveInput.addEventListener("compositionend", () => {
        if (aboveInput.value) commitLeadingInput();
      });
      aboveInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitLeadingInput();
        } else if (event.key === "Escape") {
          event.preventDefault();
          aboveInput.value = "";
          aboveInput.blur();
        }
      });
      wrap.appendChild(aboveInput);
    }

    const toolbar = document.createElement("div");
    toolbar.className = "mm-widget-toolbar mm-code-block__toolbar";

    let codeState: NestedState | null = null;
    const selectValue = fenceLangForSelect(this.lang);
    const known = new Set(CODE_BLOCK_LANG_OPTIONS.map((option) => option.value));
    const languageOptions =
      selectValue && !known.has(selectValue)
        ? [...CODE_BLOCK_LANG_OPTIONS, { value: selectValue, label: selectValue }]
        : CODE_BLOCK_LANG_OPTIONS;
    const initialLangLabel =
      languageOptions.find((option) => option.value === selectValue)?.label ?? "Plain Text";
    const langMenu = createToolbarMenuButton(
      initialLangLabel,
      languageOptions.map((option) => ({
        label: option.label,
        isActive: () => fenceLangForSelect(codeState?.lang ?? "") === option.value,
        onClick: () => {
          const state = codeState;
          if (!state) return;
          const next = normalizeFenceLang(option.value);
          state.lang = next;
          const trigger = langMenu.querySelector(
            ".mm-widget-menu__trigger",
          ) as HTMLButtonElement | null;
          if (trigger) trigger.textContent = `${option.label} ▾`;
          void applyLanguage(state, next);
          persistFence(state);
        },
      })),
    );
    langMenu.classList.add("mm-code-block__lang-menu");
    langMenu.title = "代码语言";

    const themeLabel =
      CODE_BLOCK_THEME_OPTIONS.find((option) => option.value === this.theme)?.label ?? "Night Owl";
    const themeMenu = createToolbarMenuButton(
      themeLabel,
      CODE_BLOCK_THEME_OPTIONS.map((option) => ({
        label: option.label,
        isActive: () => codeState?.theme === option.value,
        onClick: () => {
          const state = codeState;
          if (!state) return;
          state.theme = option.value;
          wrap.dataset.codeTheme = option.value;
          const trigger = themeMenu.querySelector(
            ".mm-widget-menu__trigger",
          ) as HTMLButtonElement | null;
          if (trigger) trigger.textContent = `${option.label} ▾`;
          persistFence(state);
        },
      })),
    );
    themeMenu.classList.add("mm-code-block__theme-menu");
    themeMenu.title = "代码高亮主题";

    toolbar.append(
      langMenu,
      themeMenu,
      createToolbarButton("复制源码", () => {
        const state = getState(wrap);
        void copyTextToClipboard(
          serializeFencedCode(
            state?.lang ?? this.lang,
            normalizeCodeBody(state?.nested.state.doc.toString() ?? this.body),
            state?.theme ?? this.theme,
          ),
        ).then((ok) => {
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
      theme: this.theme,
      languageLoadToken: 0,
      debounce: null,
      suppressWrite: false,
      destroyed: false,
      resizeObserver: null,
      measureFrame: null,
    };
    stateRef.current = state;
    codeState = state;
    setState(wrap, state);
    activeCodeBlocks.add(state);

    const pendingFocusPos = view.state.field(codeBlockBodyFocusField, false);
    if (pendingFocusPos != null && pendingFocusPos >= this.from && pendingFocusPos <= this.to) {
      queueMicrotask(() => {
        if (state.destroyed || !view.hasFocus) return;
        nested.focus();
        nested.dispatch({ selection: { anchor: nested.state.doc.length } });
        view.dispatch({ effects: requestCodeBlockBodyFocus.of(null) });
      });
    }

    // 内嵌编辑器的行数/换行随时可能变化（输入换行、粘贴多行、切语言后换行宽度变化），
    // 这些变化只发生在 widget 内部 DOM，主编辑器的块高度缓存不会自动感知——
    // 必须显式 requestMeasure，否则点击 widget 下方内容会命中错误的行（CM6 官方要求）。
    if (typeof ResizeObserver !== "undefined") {
      state.resizeObserver = new ResizeObserver(() => {
        if (state.destroyed || state.measureFrame != null) return;
        state.measureFrame = requestAnimationFrame(() => {
          state.measureFrame = null;
          if (!state.destroyed) view.requestMeasure();
        });
      });
      state.resizeObserver.observe(wrap);
    }

    wrap.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".mm-code-block__lang-menu, .mm-widget-btn")) return;
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
