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
}

.branch-selector__label {
  color: #666;
}

.branch-selector__select {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  background: var(--mm-color-bg, #fff);
  font-size: 12px;
}
</style>
