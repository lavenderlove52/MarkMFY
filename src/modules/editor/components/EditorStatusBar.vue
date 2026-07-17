<script setup lang="ts">
import { computed } from "vue";
import { useTabsStore } from "../../tabs";
import { isMarkdownPath } from "../language/fileMode";
import { editorDocStats, formatByteSize } from "../statusStats";

defineOptions({ name: "EditorStatusBar" });

const tabsStore = useTabsStore();

const visible = computed(() => {
  const tab = tabsStore.activeTab;
  return !!tab && isMarkdownPath(tab.filePath) && editorDocStats.value != null;
});

const charsLabel = computed(() => {
  const n = editorDocStats.value?.chars ?? 0;
  return `${n.toLocaleString()} 字`;
});

const linesLabel = computed(() => {
  const n = editorDocStats.value?.lines ?? 0;
  return `${n.toLocaleString()} 行`;
});

const sizeLabel = computed(() => formatByteSize(editorDocStats.value?.bytes ?? 0));
</script>

<template>
  <footer v-if="visible" class="mm-status-bar" aria-label="文档统计">
    <span class="mm-status-bar__item" title="字符数（按 Unicode 码点）">{{ charsLabel }}</span>
    <span class="mm-status-bar__sep" aria-hidden="true">·</span>
    <span class="mm-status-bar__item" title="行数">{{ linesLabel }}</span>
    <span class="mm-status-bar__sep" aria-hidden="true">·</span>
    <span class="mm-status-bar__item" title="UTF-8 文件大小">{{ sizeLabel }}</span>
  </footer>
</template>

<style scoped>
.mm-status-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-height: 24px;
  padding: 0 14px;
  border-top: 1px solid var(--mm-color-border);
  background: var(--mm-color-bg-muted);
  color: var(--mm-color-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.mm-status-bar__item {
  white-space: nowrap;
}

.mm-status-bar__sep {
  opacity: 0.45;
}
</style>
