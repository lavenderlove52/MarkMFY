<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { FileTreeNode } from "../types";

defineOptions({ name: "FileTree" });

const props = withDefaults(
  defineProps<{
    nodes: FileTreeNode[];
    activePath?: string;
    selectedPath?: string | null;
    /** 仅最外层树负责右键菜单 DOM */
    root?: boolean;
  }>(),
  { root: true, activePath: undefined, selectedPath: null },
);

const emit = defineEmits<{
  toggle: [node: FileTreeNode];
  openFile: [node: FileTreeNode];
  select: [node: FileTreeNode];
  createFile: [node: FileTreeNode | null];
  createFolder: [node: FileTreeNode | null];
  revealInDir: [node: FileTreeNode];
  /** 子树把右键坐标冒泡给根节点 */
  contextMenuAt: [payload: { node: FileTreeNode; x: number; y: number }];
}>();

interface ContextMenuState {
  x: number;
  y: number;
  node: FileTreeNode;
}

const contextMenu = ref<ContextMenuState | null>(null);

function onNodeClick(node: FileTreeNode): void {
  emit("select", node);
  if (node.isDir) {
    emit("toggle", node);
  } else {
    emit("openFile", node);
  }
}

function openMenu(node: FileTreeNode, x: number, y: number): void {
  emit("select", node);
  if (props.root) {
    contextMenu.value = { x, y, node };
  } else {
    emit("contextMenuAt", { node, x, y });
  }
}

function onContextMenu(event: MouseEvent, node: FileTreeNode): void {
  event.preventDefault();
  event.stopPropagation();
  openMenu(node, event.clientX, event.clientY);
}

function onChildContextMenu(payload: { node: FileTreeNode; x: number; y: number }): void {
  openMenu(payload.node, payload.x, payload.y);
}

function closeContextMenu(): void {
  contextMenu.value = null;
}

function runCreateFile(): void {
  const node = contextMenu.value?.node ?? null;
  closeContextMenu();
  emit("createFile", node);
}

function runCreateFolder(): void {
  const node = contextMenu.value?.node ?? null;
  closeContextMenu();
  emit("createFolder", node);
}

function runRevealInDir(): void {
  const node = contextMenu.value?.node;
  closeContextMenu();
  if (node) emit("revealInDir", node);
}

function onDocClick(): void {
  closeContextMenu();
}

onMounted(() => {
  if (props.root) document.addEventListener("click", onDocClick);
});
onBeforeUnmount(() => {
  if (props.root) document.removeEventListener("click", onDocClick);
});
</script>

<template>
  <ul class="file-tree" :class="{ 'file-tree--root': props.root }">
    <li v-for="node in props.nodes" :key="node.path">
      <div
        class="file-tree__row"
        :class="{
          'file-tree__row--active': node.path === props.activePath,
          'file-tree__row--selected': node.path === props.selectedPath,
        }"
        @click="onNodeClick(node)"
        @contextmenu="onContextMenu($event, node)"
      >
        <span class="file-tree__icon">
          {{ node.isDir ? (node.expanded ? "▾" : "▸") : "·" }}
        </span>
        <span class="file-tree__name">{{ node.name }}</span>
      </div>
      <FileTree
        v-if="node.isDir && node.expanded && node.children"
        :root="false"
        :nodes="node.children"
        :active-path="props.activePath"
        :selected-path="props.selectedPath"
        @toggle="(child) => emit('toggle', child)"
        @open-file="(child) => emit('openFile', child)"
        @select="(child) => emit('select', child)"
        @create-file="(child) => emit('createFile', child)"
        @create-folder="(child) => emit('createFolder', child)"
        @reveal-in-dir="(child) => emit('revealInDir', child)"
        @context-menu-at="onChildContextMenu"
      />
    </li>
  </ul>

  <Teleport v-if="props.root" to="body">
    <div
      v-if="contextMenu"
      class="file-tree__menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button type="button" class="file-tree__menu-item" @click="runCreateFile">
        新建 Markdown
      </button>
      <button type="button" class="file-tree__menu-item" @click="runCreateFolder">
        新建文件夹
      </button>
      <button
        v-if="contextMenu.node"
        type="button"
        class="file-tree__menu-item"
        @click="runRevealInDir"
      >
        {{ contextMenu.node.isDir ? "打开文件夹" : "打开文件所在目录" }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.file-tree {
  list-style: none;
  margin: 0;
  padding: 4px 6px 4px 12px;
}

.file-tree--root {
  padding-top: 2px;
}

.file-tree__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 3px 8px;
  border-radius: var(--mm-radius-sm);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  color: var(--mm-color-text);
  transition: background var(--mm-duration-fast, 120ms) var(--mm-ease-standard, ease-out);
}

.file-tree__row:hover {
  background: var(--mm-color-hover);
}

.file-tree__row--selected:not(.file-tree__row--active) {
  background: var(--mm-color-hover);
}

.file-tree__row--active {
  background: var(--mm-color-selection, var(--mm-color-active));
  color: var(--mm-color-text);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--mm-color-accent);
}

.file-tree__icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  color: var(--mm-color-text-muted);
}

.file-tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style>
.file-tree__menu {
  position: fixed;
  z-index: 10000;
  min-width: 140px;
  padding: 4px;
  background: var(--mm-color-surface);
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  box-shadow: var(--mm-shadow-panel);
}

.file-tree__menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--mm-radius-sm);
  background: transparent;
  color: var(--mm-color-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.file-tree__menu-item:hover {
  background: var(--mm-color-hover);
}
</style>
