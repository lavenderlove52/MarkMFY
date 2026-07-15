/**
 * 快捷键解析与全局监听。
 * 格式：`Mod-s` / `Mod-Shift-p` / `Ctrl-Alt-k` / `F5`（段不区分大小写）。
 */

export interface ParsedShortcut {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  const parts = shortcut
    .split(/[+-]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const result: ParsedShortcut = {
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    key: "",
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].toLowerCase();
    const isLast = i === parts.length - 1;
    if (!isLast) {
      if (part === "mod" || part === "cmd" || part === "command") result.mod = true;
      else if (part === "ctrl" || part === "control") result.ctrl = true;
      else if (part === "meta" || part === "win") result.meta = true;
      else if (part === "alt" || part === "option") result.alt = true;
      else if (part === "shift") result.shift = true;
      else return null;
    } else {
      result.key = part === "space" ? " " : part;
    }
  }
  if (!result.key) return null;
  return result;
}

function eventKeyToken(e: KeyboardEvent): string {
  if (e.key === " ") return " ";
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key.toLowerCase();
}

export function eventMatchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;

  const key = eventKeyToken(e);
  if (key !== parsed.key) return false;

  const wantsCtrl = parsed.ctrl || parsed.mod;
  const wantsMeta = parsed.meta || parsed.mod;
  // Mod：Win 要 Ctrl，Mac 要 Meta；同时按下另一侧也不拒绝（浏览器常见）
  if (parsed.mod) {
    if (!(e.ctrlKey || e.metaKey)) return false;
  } else {
    if (wantsCtrl !== e.ctrlKey) return false;
    if (wantsMeta !== e.metaKey) return false;
  }
  if (parsed.alt !== e.altKey) return false;
  if (parsed.shift !== e.shiftKey) return false;
  return true;
}

/** 人类可读展示（Windows 倾向 Ctrl）。 */
export function formatShortcutLabel(shortcut: string): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return shortcut;
  const parts: string[] = [];
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  if (parsed.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (parsed.ctrl && !parsed.mod) parts.push("Ctrl");
  if (parsed.meta && !parsed.mod) parts.push(isMac ? "⌘" : "Win");
  if (parsed.alt) parts.push(isMac ? "⌥" : "Alt");
  if (parsed.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(parsed.key === " " ? "Space" : parsed.key.toUpperCase());
  return parts.join("+");
}

export type KeymapHandler = (e: KeyboardEvent) => boolean | void | Promise<boolean | void>;

/**
 * 安装全局快捷键：在捕获阶段匹配命令快捷键。
 * 输入框内仍允许 Mod 组合键（保存/面板），避免纯字符被吞。
 */
export function installGlobalKeymap(handler: KeymapHandler): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    void (async () => {
      const handled = await handler(e);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    })();
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
