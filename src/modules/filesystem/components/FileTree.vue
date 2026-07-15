<script setup lang="ts">
import type { FileTreeNode } from "../types";

defineOptions({ name: "FileTree" });

const props = defineProps<{
  nodes: FileTreeNode[];
  activePath?: string;
}>();

const emit = defineEmits<{
  toggle: [node: FileTreeNode];
  openFile: [node: FileTreeNode];
}>();

function onNodeClick(node: FileTreeNode): void {
  if (node.isDir) {
    emit("toggle", node);
  } else {
    emit("openFile", node);
  }
}
</script>

<template>
  <ul class="file-tree">
    <li v-for="node in props.nodes" :key="node.path">
      <div
        class="file-tree__row"
        :class="{ 'file-tree__row--active': node.path === props.activePath }"
        @click="onNodeClick(node)"
      >
        <span class="file-tree__icon">
          {{ node.isDir ? (node.expanded ? "▾" : "▸") : "·" }}
        </span>
        <span class="file-tree__name">{{ node.name }}</span>
      </div>
      <FileTree
        v-if="node.isDir && node.expanded && node.children"
        :nodes="node.children"
        :active-path="props.activePath"
        @toggle="(child) => emit('toggle', child)"
        @open-file="(child) => emit('openFile', child)"
      />
    </li>
  </ul>
</template>

<style scoped>
.file-tree {
  list-style: none;
  margin: 0;
  padding-left: 12px;
}

.file-tree__row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.file-tree__row:hover {
  background: var(--mm-color-hover, rgba(0, 0, 0, 0.06));
}

.file-tree__row--active {
  background: var(--mm-color-active, rgba(0, 0, 0, 0.1));
}

.file-tree__icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.file-tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
