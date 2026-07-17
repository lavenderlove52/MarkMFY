<script setup lang="ts">
import type { CommitInfo } from "../types";

defineProps<{
  commits: CommitInfo[];
  selectedHash?: string | null;
}>();

const emit = defineEmits<{
  select: [commit: CommitInfo];
}>();

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}
</script>

<template>
  <ul class="commit-list">
    <li
      v-for="commit in commits"
      :key="commit.hash"
      class="commit-list__item"
      :class="{ 'commit-list__item--active': commit.hash === selectedHash }"
      @click="emit('select', commit)"
    >
      <div class="commit-list__message">{{ commit.message || "(无提交信息)" }}</div>
      <div class="commit-list__meta">
        <span>{{ shortHash(commit.hash) }}</span>
        <span>{{ commit.author }}</span>
        <span>{{ formatTime(commit.time) }}</span>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.commit-list {
  list-style: none;
  margin: 0;
  padding: 6px;
}

.commit-list__item {
  padding: 8px 10px;
  border-radius: var(--mm-radius-sm);
  cursor: pointer;
}

.commit-list__item:hover {
  background: var(--mm-color-hover);
}

.commit-list__item--active {
  background: var(--mm-color-active);
}

.commit-list__message {
  font-size: 13px;
  margin-bottom: 4px;
  word-break: break-word;
}

.commit-list__meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--mm-color-text-muted);
  overflow: hidden;
}
</style>
