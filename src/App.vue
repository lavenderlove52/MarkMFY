<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useWorkspaceStore, FileTree, type FileTreeNode } from "./modules/filesystem";
import { useTabsStore, TabsBar } from "./modules/tabs";
import { Editor } from "./modules/editor";
import { GitPanel } from "./modules/git";
import { SettingsPanel, useSettingsStore } from "./modules/settings";
import { applyTheme } from "./modules/theme";
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

const workspaceStore = useWorkspaceStore();
const tabsStore = useTabsStore();
const settingsStore = useSettingsStore();
const settingsOpen = ref(false);
const commandPaletteOpen = ref(false);

const activePath = computed(() => tabsStore.activeTab?.filePath);

function syncThemeFromSettings(): void {
  applyTheme(settingsStore.theme, {
    fontFamily: settingsStore.editorFontFamily,
    fontSize: settingsStore.editorFontSize,
  });
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

let uninstallKeymap: (() => void) | null = null;

onMounted(() => {
  registerAppCommands({
    openSettings,
    openCommandPalette,
    closeCommandPalette,
    isCommandPaletteOpen: () => commandPaletteOpen.value,
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
    await settingsStore.load();
    syncCommandKeybindings(settingsStore.keybindings);
    syncThemeFromSettings();
  })();
});

onBeforeUnmount(() => {
  uninstallKeymap?.();
  uninstallKeymap = null;
});

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
  await tabsStore.openFile(node.path);
}

function onKeybindingsChange(overrides: Record<string, string>): void {
  syncCommandKeybindings(overrides);
}
</script>

<template>
  <div class="app-shell">
    <header class="app-shell__toolbar">
      <button type="button" class="app-shell__btn" @click="runCommand('workspace.openFolder')">
        打开文件夹
      </button>
      <button type="button" class="app-shell__btn" @click="openCommandPalette">命令面板</button>
      <span class="app-shell__path" :title="workspaceStore.rootPath ?? ''">
        {{ workspaceStore.rootPath ?? "未打开工作区" }}
      </span>
      <button type="button" class="app-shell__btn app-shell__btn--right" @click="openSettings">
        设置
      </button>
    </header>

    <div class="app-shell__main">
      <aside class="app-shell__sidebar">
        <div class="app-shell__sidebar-title">文件</div>
        <FileTree
          v-if="workspaceStore.tree.length > 0"
          :nodes="workspaceStore.tree"
          :active-path="activePath"
          @toggle="onToggle"
          @open-file="onOpenFile"
        />
        <div v-else class="app-shell__empty">打开一个文件夹开始编辑</div>
      </aside>

      <section class="app-shell__editor">
        <TabsBar />
        <div class="app-shell__editor-body">
          <Editor v-if="tabsStore.activeTab" />
          <div v-else class="app-shell__empty">从左侧文件树打开一个文件</div>
        </div>
      </section>

      <GitPanel class="app-shell__git" />
    </div>

    <SettingsPanel
      :open="settingsOpen"
      @close="settingsOpen = false"
      @keybindings-change="onKeybindingsChange"
    />
    <CommandPalette :open="commandPaletteOpen" @close="closeCommandPalette" />
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
  font-family:
    "Segoe UI",
    system-ui,
    -apple-system,
    sans-serif;
  color: var(--mm-color-text);
  background: var(--mm-color-bg);
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
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mm-color-border);
  background: var(--mm-color-bg-muted);
  flex-shrink: 0;
}

.app-shell__btn {
  border: 1px solid var(--mm-color-border);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 13px;
}

.app-shell__btn:hover {
  border-color: var(--mm-color-accent);
}

.app-shell__btn--right {
  margin-left: auto;
}

.app-shell__path {
  font-size: 12px;
  color: var(--mm-color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.app-shell__main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.app-shell__sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--mm-color-border);
  background: var(--mm-color-panel);
  overflow: auto;
}

.app-shell__sidebar-title {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--mm-color-text-muted);
  border-bottom: 1px solid var(--mm-color-border);
}

.app-shell__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--mm-color-bg);
}

.app-shell__editor-body {
  flex: 1;
  min-height: 0;
}

.app-shell__git {
  width: 320px;
  flex-shrink: 0;
}

.app-shell__empty {
  padding: 16px;
  color: var(--mm-color-text-muted);
  font-size: 13px;
}
</style>
