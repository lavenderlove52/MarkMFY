<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspaceStore, FileTree, type FileTreeNode } from "./modules/filesystem";
import { useTabsStore, TabsBar, ExternalChangeDialog } from "./modules/tabs";
import { Editor, FormatToolbar, EditorStatusBar, isMarkdownPath, dirName } from "./modules/editor";
import { GitPanel, useGitStore } from "./modules/git";
import { SearchPanel, useSearchStore } from "./modules/search";
import { SettingsPanel, useSettingsStore } from "./modules/settings";
import { applyTheme } from "./modules/theme";
import ToastHost from "./components/ToastHost.vue";
import InputDialog from "./components/InputDialog.vue";
import { toastError } from "./notify";
import {
  CommandPalette,
  effectiveShortcut,
  eventMatchesShortcut,
  executeCommand,
  getCommand,
  installGlobalKeymap,
  listCommands,
} from "./modules/command";
import { registerAppCommands, runCommand, syncCommandKeybindings } from "./registerCommands";
import { getStartupOpenPaths, revealInDir } from "./ipc";

const appWindow = getCurrentWindow();
const workspaceStore = useWorkspaceStore();
const tabsStore = useTabsStore();
const settingsStore = useSettingsStore();
const searchStore = useSearchStore();
const gitStore = useGitStore();
const settingsOpen = ref(false);
const commandPaletteOpen = ref(false);
const windowMaximized = ref(false);

const sidebarWidth = ref(240);
const gitPanelWidth = ref(320);
const sidebarOpen = ref(true);
const gitPanelOpen = ref(true);
const refreshingWorkspace = ref(false);
const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_COLLAPSE_MIN_WIDTH = 104;
const SIDEBAR_COLLAPSE_MAX_WIDTH = 140;

const activePath = computed(() => tabsStore.activeTab?.filePath);
const navigationHistory = ref<string[]>([]);
const navigationIndex = ref(-1);
const openTabPaths = computed(() => new Set(tabsStore.tabs.map((tab) => tab.filePath)));
let navigatingHistoryTo: string | null = null;

function findHistoryTarget(step: -1 | 1): { path: string; index: number } | null {
  let index = navigationIndex.value + step;
  while (index >= 0 && index < navigationHistory.value.length) {
    const path = navigationHistory.value[index];
    if (path && openTabPaths.value.has(path)) return { path, index };
    index += step;
  }
  return null;
}

const canNavigateBack = computed(() => findHistoryTarget(-1) !== null);
const canNavigateForward = computed(() => findHistoryTarget(1) !== null);

function navigateHistory(step: -1 | 1): void {
  const target = findHistoryTarget(step);
  if (!target || !tabsStore.tabs.some((tab) => tab.filePath === target.path)) return;
  navigationIndex.value = target.index;
  navigatingHistoryTo = target.path;
  tabsStore.setActive(target.path);
}

watch(activePath, (path) => {
  if (!path) return;
  if (navigatingHistoryTo === path) {
    navigatingHistoryTo = null;
    return;
  }
  const current = navigationHistory.value[navigationIndex.value];
  if (current === path) return;
  navigationHistory.value = [...navigationHistory.value.slice(0, navigationIndex.value + 1), path];
  if (navigationHistory.value.length > 200) {
    navigationHistory.value.splice(0, navigationHistory.value.length - 200);
  }
  navigationIndex.value = navigationHistory.value.length - 1;
});

type NewItemKind = "file" | "folder";
const newItemDialogOpen = ref(false);
const newItemDialogKind = ref<NewItemKind>("file");
let resolveNewItemName: ((value: string | null) => void) | null = null;

const newItemDialogTitle = computed(() =>
  newItemDialogKind.value === "file" ? "新建 Markdown 文件" : "新建文件夹",
);
const newItemDialogLabel = computed(() =>
  newItemDialogKind.value === "file" ? "文件名（可省略 .md）" : "文件夹名称",
);
const newItemDialogInitialValue = computed(() =>
  newItemDialogKind.value === "file" ? "未命名" : "新建文件夹",
);

function requestNewItemName(kind: NewItemKind): Promise<string | null> {
  resolveNewItemName?.(null);
  newItemDialogKind.value = kind;
  newItemDialogOpen.value = true;
  return new Promise((resolve) => {
    resolveNewItemName = resolve;
  });
}

function closeNewItemDialog(value: string | null): void {
  newItemDialogOpen.value = false;
  const resolve = resolveNewItemName;
  resolveNewItemName = null;
  resolve?.(value);
}

function confirmNewItemName(value: string): void {
  closeNewItemDialog(value);
}

function cancelNewItemName(): void {
  closeNewItemDialog(null);
}

const showFormatToolbar = computed(
  () => !!tabsStore.activeTab && isMarkdownPath(tabsStore.activeTab.filePath),
);
type ToolbarMenu = "file" | "view" | "search" | "export" | "tools";
const openToolbarMenu = ref<ToolbarMenu | null>(null);

/**
 * 二级菜单（子菜单）的悬停控制：鼠标从触发按钮移到子菜单列表之间有几像素间隙，
 * 直接用 mouseleave 关闭会导致「刚移过去就折叠、点不到」。这里改成延迟关闭，
 * 若在延迟内重新进入（含进入子菜单本身，因为它是触发元素的 DOM 后代）就取消关闭。
 */
function createSubmenuHover(target: Ref<boolean>): {
  open: () => void;
  scheduleClose: () => void;
  toggle: () => void;
  reset: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    open: () => {
      clearTimer();
      target.value = true;
    },
    scheduleClose: () => {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        target.value = false;
      }, 220);
    },
    toggle: () => {
      clearTimer();
      target.value = !target.value;
    },
    reset: () => {
      clearTimer();
      target.value = false;
    },
  };
}

const openSubmenuOpen = ref(false);
const openSubmenuHover = createSubmenuHover(openSubmenuOpen);
const recentSubmenuOpen = ref(false);
const recentSubmenuHover = createSubmenuHover(recentSubmenuOpen);

async function syncWindowMaximized(): Promise<void> {
  try {
    windowMaximized.value = await appWindow.isMaximized();
  } catch {
    windowMaximized.value = false;
  }
}

let layoutPersistTimer: ReturnType<typeof setTimeout> | null = null;
let resizing: "sidebar" | "git" | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;
let resizeFrame: number | null = null;
let pendingResizeEvent: MouseEvent | null = null;

function syncThemeFromSettings(): void {
  applyTheme(
    settingsStore.theme,
    {
      fontFamily: settingsStore.editorFontFamily,
      fontSize: settingsStore.editorFontSize,
    },
    settingsStore.uiStyle,
    settingsStore.editorContentWidth,
  );
}

function syncLayoutFromSettings(): void {
  sidebarWidth.value = settingsStore.sidebarWidth;
  gitPanelWidth.value = settingsStore.gitPanelWidth;
  sidebarOpen.value = settingsStore.sidebarOpen;
  gitPanelOpen.value = settingsStore.gitPanelOpen;
}

function schedulePersistLayout(): void {
  if (!settingsStore.loaded) return;
  if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
  layoutPersistTimer = setTimeout(() => {
    layoutPersistTimer = null;
    settingsStore.patch({
      sidebarWidth: sidebarWidth.value,
      gitPanelWidth: gitPanelWidth.value,
      sidebarOpen: sidebarOpen.value,
      gitPanelOpen: gitPanelOpen.value,
    });
    void settingsStore.persist();
  }, 300);
}

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
  schedulePersistLayout();
}

function toggleGitPanel(): void {
  gitPanelOpen.value = !gitPanelOpen.value;
  schedulePersistLayout();
}

function toggleGitHistoryPanel(): void {
  if (gitPanelOpen.value && gitStore.activeTab === "history") {
    gitPanelOpen.value = false;
  } else {
    gitStore.setActiveTab("history");
    gitPanelOpen.value = true;
  }
  schedulePersistLayout();
}

function applyResizeMove(event: MouseEvent): void {
  if (!resizing) return;
  const dx = event.clientX - resizeStartX;
  if (resizing === "sidebar") {
    const nextWidth = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_COLLAPSE_MIN_WIDTH - 1, Math.round(resizeStartWidth + dx)),
    );
    const collapseWidth = Math.max(
      SIDEBAR_COLLAPSE_MIN_WIDTH,
      Math.min(SIDEBAR_COLLAPSE_MAX_WIDTH, Math.round(resizeStartWidth * 0.55)),
    );
    if (nextWidth <= collapseWidth) {
      // 收起时保留拖动前宽度，重新展开不会得到一条极窄的侧边栏。
      sidebarWidth.value = resizeStartWidth;
      sidebarOpen.value = false;
      stopColumnResize();
      schedulePersistLayout();
      return;
    }
    sidebarWidth.value = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth));
  } else {
    gitPanelWidth.value = Math.min(560, Math.max(220, Math.round(resizeStartWidth - dx)));
  }
}

function onResizeMove(event: MouseEvent): void {
  pendingResizeEvent = event;
  if (resizeFrame != null) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    const next = pendingResizeEvent;
    pendingResizeEvent = null;
    if (next) applyResizeMove(next);
  });
}

function stopColumnResize(): void {
  resizing = null;
  pendingResizeEvent = null;
  if (resizeFrame != null) {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
  }
  document.body.classList.remove("mm-resizing-col");
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", onResizeUp);
  window.removeEventListener("blur", onResizeUp);
}

function onResizeUp(): void {
  if (!resizing) return;
  const pending = pendingResizeEvent;
  pendingResizeEvent = null;
  if (resizeFrame != null) {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
  }
  if (pending) applyResizeMove(pending);
  if (!resizing) return;
  stopColumnResize();
  schedulePersistLayout();
}

function startResize(which: "sidebar" | "git", event: MouseEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = which;
  resizeStartX = event.clientX;
  resizeStartWidth = which === "sidebar" ? sidebarWidth.value : gitPanelWidth.value;
  document.body.classList.add("mm-resizing-col");
  window.addEventListener("mousemove", onResizeMove);
  window.addEventListener("mouseup", onResizeUp);
  window.addEventListener("blur", onResizeUp);
}

function openSettings(): void {
  settingsOpen.value = true;
}

function openCommandPalette(): void {
  commandPaletteOpen.value = true;
}

function closeCommandPalette(): void {
  commandPaletteOpen.value = false;
}

function openSearch(mode: "file" | "workspace"): void {
  searchStore.openPanel(mode);
}

function toggleToolbarMenu(menu: ToolbarMenu): void {
  openToolbarMenu.value = openToolbarMenu.value === menu ? null : menu;
}

function closeToolbarMenu(): void {
  openToolbarMenu.value = null;
  recentSubmenuHover.reset();
  openSubmenuHover.reset();
}

function runToolbarAction(action: () => void | Promise<void>): void {
  closeToolbarMenu();
  void action();
}

/** 最近打开菜单展示名：优先文件夹名，完整路径作 title。 */
function recentWorkspaceLabel(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

async function openRecentWorkspace(path: string): Promise<void> {
  closeToolbarMenu();
  const ok = await workspaceStore.openFolderPath(path);
  if (!ok) {
    if (settingsStore.removeRecentWorkspacePath(path)) {
      await settingsStore.persist();
    }
  }
}

async function minimizeWindow(): Promise<void> {
  closeToolbarMenu();
  await appWindow.minimize();
}

async function toggleMaximizeWindow(): Promise<void> {
  closeToolbarMenu();
  await appWindow.toggleMaximize();
  await syncWindowMaximized();
}

async function closeWindow(): Promise<void> {
  closeToolbarMenu();
  await appWindow.close();
}

function onWindowFocusCheckExternalChanges(): void {
  void tabsStore.checkExternalChanges();
}

let uninstallKeymap: (() => void) | null = null;
let unlistenWindowResize: (() => void) | null = null;

onMounted(() => {
  registerAppCommands({
    openSettings,
    openCommandPalette,
    closeCommandPalette,
    isCommandPaletteOpen: () => commandPaletteOpen.value,
    openSearch,
    createMarkdown: () => createMarkdownNear(null),
    createFolder: () => createFolderNear(null),
  });

  uninstallKeymap = installGlobalKeymap((e) => {
    const paletteCmd = getCommand("command.palette");
    const paletteShortcut =
      (paletteCmd ? effectiveShortcut(paletteCmd) : undefined) ?? "Mod-Shift-p";

    if (commandPaletteOpen.value) {
      if (eventMatchesShortcut(e, paletteShortcut)) {
        closeCommandPalette();
        return true;
      }
      return false;
    }

    for (const cmd of listCommands()) {
      const shortcut = effectiveShortcut(cmd);
      if (!shortcut) continue;
      if (eventMatchesShortcut(e, shortcut)) {
        void executeCommand(cmd.id);
        return true;
      }
    }
    return false;
  });

  void (async () => {
    await syncWindowMaximized();
    unlistenWindowResize = await appWindow.onResized(() => {
      void syncWindowMaximized();
    });

    await settingsStore.load();
    syncLayoutFromSettings();
    syncCommandKeybindings(settingsStore.keybindings);
    syncThemeFromSettings();

    // 命令行/「打开方式」传入的文件优先：工作区为文件所在目录并打开该文件
    let openedFromArgs = false;
    try {
      const startupPaths = await getStartupOpenPaths();
      const target = startupPaths[0];
      if (target) {
        if (target.isDir) {
          openedFromArgs = await workspaceStore.openFolderPath(target.path);
        } else {
          const parent = dirName(target.path);
          if (parent) {
            openedFromArgs = await workspaceStore.openFolderPath(parent);
            if (openedFromArgs) {
              workspaceStore.selectPath(target.path);
              await tabsStore.openFile(target.path);
            }
          }
        }
      }
    } catch {
      // 忽略启动参数解析失败，回退到上次工作区
    }

    if (!openedFromArgs) {
      const last = settingsStore.lastWorkspacePath.trim();
      if (last) {
        const ok = await workspaceStore.openFolderPath(last);
        if (!ok) {
          settingsStore.setLastWorkspacePath("");
          settingsStore.removeRecentWorkspacePath(last);
          await settingsStore.persist();
        }
      }
    }
  })();
  window.addEventListener("click", closeToolbarMenu);
  // 窗口重新获得焦点时检测已打开文件是否被其它程序改过（最常见的外部修改场景：
  // 切到别的编辑器/工具改完文件再切回来）。
  window.addEventListener("focus", onWindowFocusCheckExternalChanges);
});

onBeforeUnmount(() => {
  uninstallKeymap?.();
  uninstallKeymap = null;
  unlistenWindowResize?.();
  unlistenWindowResize = null;
  if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
  stopColumnResize();
  window.removeEventListener("click", closeToolbarMenu);
  window.removeEventListener("focus", onWindowFocusCheckExternalChanges);
});

watch(
  () => workspaceStore.rootPath,
  (path) => {
    if (!path || !settingsStore.loaded) return;
    let dirty = false;
    if (settingsStore.lastWorkspacePath !== path) {
      settingsStore.setLastWorkspacePath(path);
      dirty = true;
    }
    if (settingsStore.touchRecentWorkspacePath(path)) {
      dirty = true;
    }
    if (dirty) void settingsStore.persist();
  },
);

watch(
  () => [
    settingsStore.theme,
    settingsStore.uiStyle,
    settingsStore.editorFontFamily,
    settingsStore.editorFontSize,
    settingsStore.editorContentWidth,
  ],
  () => {
    syncThemeFromSettings();
  },
);

watch(
  () => settingsStore.keybindings,
  (next) => {
    syncCommandKeybindings(next);
  },
  { deep: true },
);

async function onToggle(node: FileTreeNode): Promise<void> {
  await workspaceStore.toggleNode(node);
}

async function onOpenFile(node: FileTreeNode): Promise<void> {
  workspaceStore.selectPath(node.path);
  await tabsStore.openFile(node.path);
}

function onSelectNode(node: FileTreeNode): void {
  workspaceStore.selectPath(node.path);
}

async function createMarkdownNear(node: FileTreeNode | null): Promise<void> {
  if (!workspaceStore.isOpen && !(await workspaceStore.openFolder())) return;
  if (node) workspaceStore.selectPath(node.path);
  const name = await requestNewItemName("file");
  if (name === null) return;
  const path = await workspaceStore.createMarkdownFile(name || null);
  if (path) await tabsStore.openFile(path);
}

async function createFolderNear(node: FileTreeNode | null): Promise<void> {
  if (!workspaceStore.isOpen && !(await workspaceStore.openFolder())) return;
  if (node) workspaceStore.selectPath(node.path);
  const name = await requestNewItemName("folder");
  if (name === null) return;
  await workspaceStore.createFolder(name || null);
}

async function onRevealInDir(node: FileTreeNode): Promise<void> {
  workspaceStore.selectPath(node.path);
  try {
    await revealInDir(node.path, node.isDir);
  } catch (err) {
    toastError(err, "打开文件所在目录失败");
  }
}

async function onCreateFileToolbar(): Promise<void> {
  await createMarkdownNear(null);
}

async function onCreateFolderToolbar(): Promise<void> {
  await createFolderNear(null);
}

async function refreshWorkspaceTree(): Promise<void> {
  if (!workspaceStore.isOpen || refreshingWorkspace.value) return;
  refreshingWorkspace.value = true;
  try {
    await workspaceStore.refresh();
  } finally {
    refreshingWorkspace.value = false;
  }
}

function onKeybindingsChange(overrides: Record<string, string>): void {
  syncCommandKeybindings(overrides);
}
</script>

<template>
  <div class="app-shell">
    <header class="app-shell__toolbar" @click.stop>
      <div class="app-shell__toolbar-leading">
        <button
          type="button"
          class="app-shell__header-icon-btn"
          title="后退"
          aria-label="后退"
          :disabled="!canNavigateBack"
          @click="navigateHistory(-1)"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M11.8 4.7 6.5 10l5.3 5.3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="app-shell__header-icon-btn"
          title="前进"
          aria-label="前进"
          :disabled="!canNavigateForward"
          @click="navigateHistory(1)"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="m8.2 4.7 5.3 5.3-5.3 5.3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="app-shell__header-icon-btn app-shell__sidebar-toggle"
          :title="sidebarOpen ? '收起侧边栏' : '展开侧边栏'"
          :aria-label="sidebarOpen ? '收起侧边栏' : '展开侧边栏'"
          :aria-expanded="sidebarOpen"
          aria-controls="workspace-sidebar"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect
              x="2.25"
              y="3.5"
              width="15.5"
              height="13"
              rx="2.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
            />
            <rect x="4.9" y="6.15" width="4.6" height="7.7" rx="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          class="app-shell__header-icon-btn"
          :class="{ 'app-shell__header-icon-btn--active': gitPanelOpen }"
          :title="
            gitPanelOpen && gitStore.activeTab === 'history' ? '收起 Git 记录' : '打开 Git 记录'
          "
          :aria-label="
            gitPanelOpen && gitStore.activeTab === 'history' ? '收起 Git 记录' : '打开 Git 记录'
          "
          :aria-expanded="gitPanelOpen"
          :disabled="!workspaceStore.isOpen"
          @click="toggleGitHistoryPanel"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="5" r="2" />
            <circle cx="6" cy="19" r="2" />
            <circle cx="18" cy="7" r="2" />
            <path d="M6 7v10M18 9c0 4-3 6-6 6H6" />
          </svg>
        </button>
      </div>
      <nav class="app-shell__menus" aria-label="主功能菜单">
        <div class="app-shell__menu">
          <button
            type="button"
            class="app-shell__menu-trigger"
            :class="{ 'app-shell__menu-trigger--open': openToolbarMenu === 'file' }"
            :aria-expanded="openToolbarMenu === 'file'"
            @click="toggleToolbarMenu('file')"
          >
            文件
          </button>
          <div v-if="openToolbarMenu === 'file'" class="app-shell__menu-list">
            <div
              class="app-shell__menu-item--has-sub"
              @mouseenter="openSubmenuHover.open()"
              @mouseleave="openSubmenuHover.scheduleClose()"
            >
              <button
                type="button"
                class="app-shell__menu-item app-shell__menu-item--primary"
                :class="{ 'app-shell__menu-item--sub-open': openSubmenuOpen }"
                @click.stop="openSubmenuHover.toggle()"
              >
                <span>打开</span>
                <span class="app-shell__menu-caret" aria-hidden="true">▸</span>
              </button>
              <div
                v-if="openSubmenuOpen"
                class="app-shell__submenu-list"
                role="menu"
                aria-label="打开文件或文件夹"
                @mouseenter="openSubmenuHover.open()"
                @mouseleave="openSubmenuHover.scheduleClose()"
              >
                <button
                  type="button"
                  class="app-shell__menu-item"
                  role="menuitem"
                  @click="runToolbarAction(() => runCommand('workspace.openFolder'))"
                >
                  打开文件夹
                </button>
                <button
                  type="button"
                  class="app-shell__menu-item"
                  role="menuitem"
                  @click="runToolbarAction(() => runCommand('workspace.openFile'))"
                >
                  打开文件
                </button>
              </div>
            </div>
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(() => runCommand('workspace.newFile'))"
            >
              新建 Markdown
            </button>
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(() => runCommand('workspace.newFolder'))"
            >
              新建文件夹
            </button>
            <div
              class="app-shell__menu-item--has-sub"
              @mouseenter="recentSubmenuHover.open()"
              @mouseleave="recentSubmenuHover.scheduleClose()"
            >
              <button
                type="button"
                class="app-shell__menu-item"
                :class="{ 'app-shell__menu-item--sub-open': recentSubmenuOpen }"
                :disabled="settingsStore.recentWorkspacePaths.length === 0"
                @click.stop="recentSubmenuHover.toggle()"
              >
                <span>最近打开</span>
                <span class="app-shell__menu-caret" aria-hidden="true">▸</span>
              </button>
              <div
                v-if="recentSubmenuOpen && settingsStore.recentWorkspacePaths.length > 0"
                class="app-shell__submenu-list"
                role="menu"
                aria-label="最近打开的文件夹"
                @mouseenter="recentSubmenuHover.open()"
                @mouseleave="recentSubmenuHover.scheduleClose()"
              >
                <button
                  v-for="recentPath in settingsStore.recentWorkspacePaths"
                  :key="recentPath"
                  type="button"
                  class="app-shell__menu-item app-shell__menu-item--recent"
                  role="menuitem"
                  :title="recentPath"
                  @click="void openRecentWorkspace(recentPath)"
                >
                  {{ recentWorkspaceLabel(recentPath) }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="app-shell__menu">
          <button
            type="button"
            class="app-shell__menu-trigger"
            :class="{ 'app-shell__menu-trigger--open': openToolbarMenu === 'view' }"
            :aria-expanded="openToolbarMenu === 'view'"
            @click="toggleToolbarMenu('view')"
          >
            视图
          </button>
          <div v-if="openToolbarMenu === 'view'" class="app-shell__menu-list">
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(toggleSidebar)"
            >
              {{ sidebarOpen ? "隐藏目录" : "显示目录" }}
            </button>
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(toggleGitPanel)"
            >
              {{ gitPanelOpen ? "隐藏 Git 面板" : "显示 Git 面板" }}
            </button>
          </div>
        </div>

        <div class="app-shell__menu">
          <button
            type="button"
            class="app-shell__menu-trigger"
            :class="{ 'app-shell__menu-trigger--open': openToolbarMenu === 'search' }"
            :aria-expanded="openToolbarMenu === 'search'"
            @click="toggleToolbarMenu('search')"
          >
            查找
          </button>
          <div v-if="openToolbarMenu === 'search'" class="app-shell__menu-list">
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(() => openSearch('file'))"
            >
              当前文件查找
            </button>
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(() => openSearch('workspace'))"
            >
              工作区搜索
            </button>
          </div>
        </div>

        <div class="app-shell__menu">
          <button
            type="button"
            class="app-shell__menu-trigger"
            :class="{ 'app-shell__menu-trigger--open': openToolbarMenu === 'export' }"
            :aria-expanded="openToolbarMenu === 'export'"
            @click="toggleToolbarMenu('export')"
          >
            导出
          </button>
          <div v-if="openToolbarMenu === 'export'" class="app-shell__menu-list">
            <button
              type="button"
              class="app-shell__menu-item"
              :disabled="!tabsStore.activeTab"
              @click="runToolbarAction(() => runCommand('export.html'))"
            >
              导出 HTML
            </button>
            <button
              type="button"
              class="app-shell__menu-item"
              :disabled="!tabsStore.activeTab"
              @click="runToolbarAction(() => runCommand('export.pdf'))"
            >
              导出 PDF
            </button>
          </div>
        </div>

        <div class="app-shell__menu">
          <button
            type="button"
            class="app-shell__menu-trigger"
            :class="{ 'app-shell__menu-trigger--open': openToolbarMenu === 'tools' }"
            :aria-expanded="openToolbarMenu === 'tools'"
            @click="toggleToolbarMenu('tools')"
          >
            工具
          </button>
          <div v-if="openToolbarMenu === 'tools'" class="app-shell__menu-list">
            <button
              type="button"
              class="app-shell__menu-item"
              @click="runToolbarAction(openCommandPalette)"
            >
              命令面板
            </button>
          </div>
        </div>

        <div class="app-shell__menu">
          <button
            type="button"
            class="app-shell__menu-trigger"
            @click="runToolbarAction(openSettings)"
          >
            设置
          </button>
        </div>
      </nav>
      <div class="app-shell__drag" data-tauri-drag-region @dblclick="toggleMaximizeWindow">
        <span class="app-shell__path" data-tauri-drag-region :title="workspaceStore.rootPath ?? ''">
          {{ workspaceStore.rootPath ?? "未打开工作区" }}
        </span>
      </div>
      <div class="app-shell__window-controls">
        <button
          type="button"
          class="app-shell__window-btn"
          title="最小化"
          aria-label="最小化"
          @click="minimizeWindow"
        >
          ─
        </button>
        <button
          type="button"
          class="app-shell__window-btn"
          :title="windowMaximized ? '还原' : '最大化'"
          :aria-label="windowMaximized ? '还原' : '最大化'"
          @click="toggleMaximizeWindow"
        >
          {{ windowMaximized ? "❐" : "□" }}
        </button>
        <button
          type="button"
          class="app-shell__window-btn app-shell__window-btn--close"
          title="关闭"
          aria-label="关闭"
          @click="closeWindow"
        >
          ×
        </button>
      </div>
    </header>

    <div class="app-shell__main">
      <aside
        v-if="sidebarOpen"
        id="workspace-sidebar"
        class="app-shell__sidebar"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <div class="app-shell__sidebar-title">
          <span>文件</span>
          <div class="app-shell__sidebar-actions">
            <button
              type="button"
              class="app-shell__panel-toggle app-shell__panel-toggle--icon"
              title="新建 Markdown"
              aria-label="新建 Markdown"
              @click="onCreateFileToolbar"
            >
              <svg class="app-shell__tree-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
                <path d="M14 2v6h6M12 18v-6M9 15h6" />
              </svg>
            </button>
            <button
              type="button"
              class="app-shell__panel-toggle app-shell__panel-toggle--icon"
              title="新建文件夹"
              aria-label="新建文件夹"
              @click="onCreateFolderToolbar"
            >
              <svg class="app-shell__tree-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
                />
                <path d="M12 10v6M9 13h6" />
              </svg>
            </button>
            <button
              type="button"
              class="app-shell__panel-toggle app-shell__panel-toggle--icon"
              title="刷新当前文件夹"
              aria-label="刷新当前文件夹"
              :aria-busy="refreshingWorkspace"
              :disabled="!workspaceStore.isOpen || refreshingWorkspace"
              @click="refreshWorkspaceTree"
            >
              <svg
                class="app-shell__refresh-icon"
                :class="{ 'app-shell__refresh-icon--spinning': refreshingWorkspace }"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  d="M16 7.3A6.5 6.5 0 1 0 16.2 12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                />
                <path
                  d="M16.2 4.1v3.5h-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <FileTree
          :nodes="workspaceStore.tree"
          :active-path="activePath"
          :selected-path="workspaceStore.selectedPath"
          empty-text="打开一个文件夹，或点击 +md 新建 Markdown"
          @toggle="onToggle"
          @open-file="onOpenFile"
          @select="onSelectNode"
          @clear-selection="workspaceStore.selectPath(null)"
          @create-file="createMarkdownNear"
          @create-folder="createFolderNear"
          @reveal-in-dir="onRevealInDir"
        />
      </aside>
      <div
        v-if="sidebarOpen"
        class="app-shell__resizer"
        title="拖拽调整目录宽度"
        @mousedown="startResize('sidebar', $event)"
      ></div>
      <section class="app-shell__editor">
        <TabsBar />
        <FormatToolbar v-if="showFormatToolbar" />
        <div class="app-shell__editor-body">
          <Editor v-if="tabsStore.activeTab" />
          <div v-else class="app-shell__empty">从左侧文件树打开一个文件</div>
        </div>
        <EditorStatusBar />
      </section>

      <SearchPanel />

      <div
        v-if="gitPanelOpen"
        class="app-shell__resizer"
        title="拖拽调整 Git 面板宽度"
        @mousedown="startResize('git', $event)"
      ></div>
      <div v-if="gitPanelOpen" class="app-shell__git" :style="{ width: `${gitPanelWidth}px` }">
        <div class="app-shell__git-bar">
          <span>Git</span>
          <button
            type="button"
            class="app-shell__panel-toggle app-shell__panel-toggle--icon"
            title="收起 Git 面板"
            aria-label="收起 Git 面板"
            aria-controls="git-panel"
            aria-expanded="true"
            @click="toggleGitPanel"
          >
            <svg class="app-shell__panel-icon" viewBox="0 0 20 20" aria-hidden="true">
              <rect
                x="2.25"
                y="3.5"
                width="15.5"
                height="13"
                rx="2.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              />
              <rect x="10.5" y="6.15" width="4.6" height="7.7" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>
        <GitPanel id="git-panel" class="app-shell__git-panel" />
      </div>
    </div>

    <SettingsPanel
      :open="settingsOpen"
      @close="settingsOpen = false"
      @keybindings-change="onKeybindingsChange"
    />
    <InputDialog
      :open="newItemDialogOpen"
      :title="newItemDialogTitle"
      :label="newItemDialogLabel"
      :initial-value="newItemDialogInitialValue"
      @confirm="confirmNewItemName"
      @cancel="cancelNewItemName"
    />
    <CommandPalette :open="commandPaletteOpen" @close="closeCommandPalette" />
    <ToastHost />
    <ExternalChangeDialog
      v-if="tabsStore.externalConflict"
      :file-name="tabsStore.externalConflict.fileName"
      :has-local-edits="tabsStore.externalConflict.hasLocalEdits"
      @keep-current="tabsStore.keepCurrentOverDisk(tabsStore.externalConflict.tabId)"
      @load-disk="tabsStore.loadDiskVersion(tabsStore.externalConflict.tabId)"
      @dismiss="tabsStore.dismissExternalConflict()"
    />
  </div>
</template>

<style>
@import "./styles/variables.css";
@import "./styles/lightbox.css";

html,
body,
#app {
  margin: 0;
  height: 100%;
}

body {
  font-family: var(--mm-ui-font-family);
  color: var(--mm-color-text);
  background: var(--mm-color-bg);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

body.mm-resizing-col {
  cursor: col-resize;
  user-select: none;
}

body.mm-resizing-col * {
  cursor: col-resize !important;
  user-select: none !important;
}
</style>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mm-color-bg);
  color: var(--mm-color-text);
}

.app-shell__toolbar {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0 0 0 8px;
  border-bottom: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  flex-shrink: 0;
  min-height: 36px;
  height: 36px;
}

.app-shell__toolbar-leading {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-right: 6px;
}

.app-shell__header-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--mm-radius-sm);
  background: transparent;
  color: var(--mm-color-text-muted);
  cursor: pointer;
}

.app-shell__header-icon-btn svg {
  display: block;
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-shell__header-icon-btn:hover:not(:disabled) {
  background: var(--mm-color-hover);
  color: var(--mm-color-text);
}

.app-shell__header-icon-btn:disabled {
  opacity: 0.32;
  cursor: default;
}

.app-shell__header-icon-btn--active {
  background: var(--mm-color-accent-soft);
  color: var(--mm-color-accent);
}

.app-shell__sidebar-toggle {
  color: var(--mm-color-text);
}

.app-shell__menus {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.app-shell__menu {
  position: relative;
}

.app-shell__menu-trigger {
  border: 1px solid transparent;
  background: transparent;
  color: var(--mm-color-text);
  border-radius: var(--mm-radius-sm);
  padding: 3px 9px;
  cursor: pointer;
  font: inherit;
  line-height: 1.35;
}

.app-shell__menu-trigger:hover,
.app-shell__menu-trigger--open {
  background: var(--mm-color-hover);
  border-color: transparent;
}

.app-shell__menu-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  min-width: 148px;
  padding: 6px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-md);
  background: var(--mm-color-surface-elevated);
  box-shadow: var(--mm-shadow-overlay);
}

.app-shell__menu-item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--mm-color-text);
  border-radius: var(--mm-radius-sm);
  padding: 7px 9px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  white-space: nowrap;
}

.app-shell__menu-item:hover {
  background: var(--mm-color-hover);
}

.app-shell__menu-item--primary {
  color: var(--mm-color-accent);
  font-weight: 600;
}

.app-shell__menu-item:disabled {
  color: var(--mm-color-text-muted);
  cursor: not-allowed;
  opacity: 0.55;
}

.app-shell__menu-item:disabled:hover {
  background: transparent;
}

.app-shell__menu-item--has-sub {
  position: relative;
}

.app-shell__menu-item--has-sub > .app-shell__menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.app-shell__menu-item--sub-open {
  background: var(--mm-color-hover);
}

.app-shell__menu-caret {
  color: var(--mm-color-text-muted);
  font-size: 0.85em;
}

.app-shell__submenu-list {
  position: absolute;
  top: 0;
  left: calc(100% + 4px);
  z-index: 21;
  min-width: 200px;
  max-width: 360px;
  max-height: min(70vh, 420px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-md);
  background: var(--mm-color-surface-elevated);
  box-shadow: var(--mm-shadow-overlay);
}

.app-shell__menu-item--recent {
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-shell__drag {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px;
}

.app-shell__path {
  font-size: 12px;
  color: var(--mm-color-text-tertiary, var(--mm-color-text-muted));
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--mm-radius-sm);
  padding: 2px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 34vw;
  pointer-events: none;
}

.app-shell__window-controls {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  margin-left: 4px;
}

.app-shell__window-btn {
  width: 46px;
  border: none;
  background: transparent;
  color: var(--mm-color-text);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-shell__window-btn:hover {
  background: var(--mm-color-hover);
}

.app-shell__window-btn--close:hover {
  background: var(--mm-color-danger);
  color: var(--mm-color-surface-elevated);
}

.app-shell__main {
  display: flex;
  flex: 1;
  min-height: 0;
  background: var(--mm-color-bg);
}

.app-shell__sidebar {
  flex-shrink: 0;
  background: var(--mm-color-sidebar, var(--mm-color-panel));
  overflow: auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--mm-color-border);
}

.app-shell__sidebar-title,
.app-shell__git-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mm-color-text-tertiary, var(--mm-color-text-muted));
  border-bottom: 1px solid transparent;
  background: transparent;
  flex-shrink: 0;
}

.app-shell__sidebar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-shell__panel-toggle {
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: inherit;
  border-radius: var(--mm-radius-sm);
  min-width: 24px;
  height: 22px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
  font-size: 11px;
}

.app-shell__panel-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-shell__panel-toggle:hover:not(:disabled) {
  border-color: var(--mm-color-accent);
  background: var(--mm-color-hover);
}

.app-shell__panel-toggle--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.app-shell__tree-action-icon {
  display: block;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-shell__panel-icon {
  display: block;
  width: 15px;
  height: 15px;
  pointer-events: none;
}

.app-shell__refresh-icon {
  display: block;
  width: 14px;
  height: 14px;
}

.app-shell__refresh-icon--spinning {
  animation: mm-refresh-spin 700ms linear infinite;
}

@keyframes mm-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-shell__refresh-icon--spinning {
    animation: none;
  }
}

.app-shell__resizer {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 2;
}

.app-shell__resizer:hover,
.app-shell__resizer:active {
  background: var(--mm-color-accent);
  opacity: 0.28;
}

.app-shell__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 120px;
  background: var(--mm-color-editor, var(--mm-color-bg));
}

.app-shell__editor-body {
  flex: 1;
  min-height: 0;
  background: var(--mm-color-editor, var(--mm-color-bg));
}

.app-shell__git {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-left: 1px solid var(--mm-color-border);
  background: var(--mm-color-sidebar, var(--mm-color-panel));
}

.app-shell__git-panel {
  flex: 1;
  min-height: 0;
  width: 100% !important;
  border-left: none;
}

.app-shell__empty {
  padding: 16px;
  color: var(--mm-color-text-muted);
  font-size: 13px;
}
</style>
