<script setup lang="ts">
import type { DiffLine } from "../types";

defineProps<{
  lines: DiffLine[];
  emptyText?: string;
}>();
</script>

<template>
  <div class="diff-viewer">
    <div v-if="lines.length === 0" class="diff-viewer__empty">
      {{ emptyText ?? "选择文件查看 diff" }}
    </div>
    <pre v-else class="diff-viewer__body">
<span
  v-for="(line, index) in lines"
  :key="index"
  class="diff-viewer__line"
  :class="{
    'diff-viewer__line--add': line.origin === '+',
    'diff-viewer__line--del': line.origin === '-',
  }"
>{{ line.origin }}{{ line.content }}
</span></pre>
  </div>
</template>

<style scoped>
.diff-viewer {
  height: 100%;
  overflow: auto;
  background: var(--mm-color-surface);
  font-family: var(--mm-font-mono, Consolas, monospace);
  font-size: 12px;
}

.diff-viewer__empty {
  padding: 16px;
  color: var(--mm-color-text-muted);
}

.diff-viewer__body {
  margin: 0;
  padding: 8px 0;
  white-space: pre;
}

.diff-viewer__line {
  display: block;
  padding: 0 10px;
  line-height: 1.55;
}

.diff-viewer__line--add {
  background: var(--mm-color-success-soft);
  color: var(--mm-color-success);
}

.diff-viewer__line--del {
  background: var(--mm-color-danger-soft);
  color: var(--mm-color-danger);
}
</style>
