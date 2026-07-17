<script setup lang="ts">
import type { BranchInfo } from "../types";

defineProps<{
  branches: BranchInfo[];
  currentBranch: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  change: [branchName: string];
}>();

function onChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  emit("change", target.value);
}
</script>

<template>
  <label class="branch-selector">
    <span class="branch-selector__label">分支</span>
    <select
      class="branch-selector__select"
      :value="currentBranch ?? ''"
      :disabled="disabled || branches.length === 0"
      @change="onChange"
    >
      <option v-if="!currentBranch" value="" disabled>无分支</option>
      <option v-for="branch in branches" :key="branch.name" :value="branch.name">
        {{ branch.name }}{{ branch.isHead ? " *" : "" }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.branch-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-width: 0;
  flex: 1;
}

.branch-selector__label {
  color: var(--mm-color-text-muted);
}

.branch-selector__select {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  background: var(--mm-color-surface);
  color: var(--mm-color-text);
  font-size: 12px;
}
</style>
