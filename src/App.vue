<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspaceStore, FileTree, type FileTreeNode } from "./modules/filesystem";
import { useTabsStore, TabsBar } from "./modules/tabs";
import { Editor, FormatToolbar, EditorStatusBar, isMarkdownPath, dirName } from "./modules/editor";
import { GitPanel } from "./modules/git";
import { SearchPanel, useSearchStore } from "./modules/search";
import { SettingsPanel, useSettingsStore } from "./modules/settings";
import { applyTheme } from "./modules/theme";
import ToastHost from "./components/ToastHost.vue";
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
import { getStartupOpenPaths } from "./ipc";

const appWindow = getCurrentWindow();
const workspaceStore = useWorkspaceStore();
const tabsStore = useTabsStore();
const settingsStore = useSettingsStore();
const searchStore = useSearchStore();
const settingsOpen = ref(false);
const commandPaletteOpen = ref(false);
const windowMaximized = ref(false);

const sidebarWidth = ref(240);
const gitPanelWidth = ref(320);
const sidebarOpen = ref(true);
const gitPanelOpen = ref(true);

const activePath = computed(() => tabsStore.activeTab?.filePath);
const showFormatToolbar = computed(
  () => !!tabsStore.activeTab && isMarkdownPath(tabsStore.activeTab.filePath),
);
type ToolbarMenu = "file" | "view" | "search" | "export" | "tools";
const openToolbarMenu = ref<ToolbarMenu | null>(null);

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

function syncThemeFromSettings(): void {
  applyTheme(settingsStore.theme, {
    fontFamily: settingsStore.editorFontFamily,
    fontSize: settingsStore.editorFontSize,
  });
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

function onResizeMove(event: MouseEvent): void {
  if (!resizing) return;
  const dx = event.clientX - resizeStartX;
  if (resizing === "sidebar") {
    sidebarWidth.value = Math.min(480, Math.max(160, Math.round(resizeStartWidth + dx)));
  } else {
    gitPanelWidth.value = Math.min(560, Math.max(220, Math.round(resizeStartWidth - dx)));
  }
}

function onResizeUp(): void {
  if (!resizing) return;
  resizing = null;
  document.body.classList.remove("mm-resizing-col");
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", onResizeUp);
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
}

function runToolbarAction(action: () => void | Promise<void>): void {
  closeToolbarMenu();
  void action();
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

let uninstallKeymap: (() => void) | null = null;
let unlistenWindowResize: (() => void) | null = null;

onMounted(() => {
  registerAppCommands({
    openSettings,
    openCommandPalette,
    closeCommandPalette,
    isCommandPaletteOpen: () => commandPaletteOpen.value,
    openSearch,
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
          await settingsStore.persist();
        }
      }
    }
  })();
  window.addEventListener("click", closeToolbarMenu);
});

onBeforeUnmount(() => {
  uninstallKeymap?.();
  uninstallKeymap = null;
  unlistenWindowResize?.();
  unlistenWindowResize = null;
  if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", onResizeUp);
  window.removeEventListener("click", closeToolbarMenu);
  document.body.classList.remove("mm-resizing-col");
});

watch(
  () => workspaceStore.rootPath,
  (path) => {
    if (!path || !settingsStore.loaded) return;
    if (settingsStore.lastWorkspacePath === path) return;
    settingsStore.setLastWorkspacePath(path);
    void settingsStore.persist();
  },
);

watch(
  () => [
    settingsStore.theme,
    settingsStore.editorFontFamily,
    settingsStore.editorFontSize,
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
  if (node) workspaceStore.selectPath(node.path);
  const name = window.prompt("新建 Markdown 文件名（可省略 .md）", "未命名");
  if (name === null) return;
  const path = await workspaceStore.createMarkdownFile(name.trim() || null);
  if (path) await tabsStore.openFile(path);
}

async function createFolderNear(node: FileTreeNode | null): Promise<void> {
  if (node) workspaceStore.selectPath(node.path);
  const name = window.prompt("新建文件夹名称", "新建文件夹");
  if (name === null) return;
  await workspaceStore.createFolder(name.trim() || null);
}

async function onCreateFileToolbar(): Promise<void> {
  await createMarkdownNear(null);
}

async function onCreateFolderToolbar(): Promise<void> {
  await createFolderNear(null);
}

function onKeybindingsChange(overrides: Record<string, string>): void {
  syncCommandKeybindings(overrides);
}
</script>

<template>
  <div class="app-shell">
    <header class="app-shell__toolbar" @click.stop>
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
            <button
              type="button"
              class="app-shell__menu-item app-shell__menu-item--primary"
              @click="runToolbarAction(() => runCommand('workspace.openFolder'))"
            >
              打开文件夹
            </button>
            <button
              type="button"
              class="app-shell__menu-item"
              :disabled="!workspaceStore.isOpen"
              @click="runToolbarAction(() => runCommand('workspace.newFile'))"
            >
              新建 Markdown
            </button>
            <button
              type="button"
              class="app-shell__menu-item"
              :disabled="!workspaceStore.isOpen"
              @click="runToolbarAction(() => runCommand('workspace.newFolder'))"
            >
              新建文件夹
            </button>
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
            <button type="button" class="app-shell__menu-item" @click="runToolbarAction(toggleSidebar)">
              {{ sidebarOpen ? "隐藏目录" : "显示目录" }}
            </button>
            <button type="button" class="app-shell__menu-item" @click="runToolbarAction(toggleGitPanel)">
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
            <button type="button" class="app-shell__menu-item" @click="runToolbarAction(() => openSearch('file'))">
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
            <button type="button" class="app-shell__menu-item" @click="runToolbarAction(openCommandPalette)">
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
      <div
        class="app-shell__drag"
        data-tauri-drag-region
        @dblclick="toggleMaximizeWindow"
      >
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
        class="app-shell__sidebar"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <div class="app-shell__sidebar-title">
          <span>文件</span>
          <div class="app-shell__sidebar-actions">
            <button
              type="button"
              class="app-shell__panel-toggle"
              title="新建 Markdown"
              :disabled="!workspaceStore.isOpen"
              @click="onCreateFileToolbar"
            >
              +md
            </button>
            <button
              type="button"
              class="app-shell__panel-toggle"
              title="新建文件夹"
              :disabled="!workspaceStore.isOpen"
              @click="onCreateFolderToolbar"
            >
              +dir
            </button>
            <button
              type="button"
              class="app-shell__panel-toggle"
              title="合上目录"
              @click="toggleSidebar"
            >
              ⟨
            </button>
          </div>
        </div>
        <FileTree
          v-if="workspaceStore.tree.length > 0"
          :nodes="workspaceStore.tree"
          :active-path="activePath"
          :selected-path="workspaceStore.selectedPath"
          @toggle="onToggle"
          @open-file="onOpenFile"
          @select="onSelectNode"
          @create-file="createMarkdownNear"
          @create-folder="createFolderNear"
        />
        <div v-else class="app-shell__empty">打开一个文件夹开始编辑</div>
      </aside>
      <div
        v-if="sidebarOpen"
        class="app-shell__resizer"
        title="拖拽调整目录宽度"
        @mousedown="startResize('sidebar', $event)"
      ></div>
      <button
        v-else
        type="button"
        class="app-shell__rail"
        title="打开文件目录"
        @click="toggleSidebar"
      >
        目录
      </button>

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
      <button
        v-else
        type="button"
        class="app-shell__rail"
        title="打开 Git 面板"
        @click="toggleGitPanel"
      >
        Git
      </button>
      <div
        v-if="gitPanelOpen"
        class="app-shell__git"
        :style="{ width: `${gitPanelWidth}px` }"
      >
        <div class="app-shell__git-bar">
          <span>Git</span>
          <button
            type="button"
            class="app-shell__panel-toggle"
            title="合上 Git 面板"
            @click="toggleGitPanel"
          >
            ⟩
          </button>
        </div>
        <GitPanel class="app-shell__git-panel" />
      </div>
    </div>

    <SettingsPanel
      :open="settingsOpen"
      @close="settingsOpen = false"
      @keybindings-change="onKeybindingsChange"
    />
    <CommandPalette :open="commandPaletteOpen" @close="closeCommandPalette" />
    <ToastHost />
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
  background: color-mix(in srgb, var(--mm-color-surface) 88%, var(--mm-color-bg-muted));
  box-shadow: var(--mm-shadow-panel);
  flex-shrink: 0;
  min-height: 36px;
  height: 36px;
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
  border-color: var(--mm-color-border);
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
  color: var(--mm-color-text-muted);
  background: var(--mm-color-bg-muted);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 10px;
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
  color: #fff;
}

.app-shell__main {
  display: flex;
  flex: 1;
  min-height: 0;
  background: var(--mm-color-bg);
}

.app-shell__sidebar {
  flex-shrink: 0;
  background: var(--mm-color-panel);
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
  color: var(--mm-color-text-muted);
  border-bottom: 1px solid var(--mm-color-border);
  background: var(--mm-color-bg-muted);
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

.app-shell__rail {
  width: 28px;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid var(--mm-color-border);
  border-left: 1px solid var(--mm-color-border);
  background: var(--mm-color-panel);
  color: var(--mm-color-text-muted);
  font-size: 12px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0.12em;
  cursor: pointer;
  padding: 8px 0;
}

.app-shell__rail:hover {
  color: var(--mm-color-accent);
  background: var(--mm-color-active);
}

.app-shell__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 120px;
  background: var(--mm-color-bg);
}

.app-shell__editor-body {
  flex: 1;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.35), transparent 160px),
    var(--mm-color-bg);
}

.app-shell__git {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-left: 1px solid var(--mm-color-border);
  background: var(--mm-color-panel);
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
