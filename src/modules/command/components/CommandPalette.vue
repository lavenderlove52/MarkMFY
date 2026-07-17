<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { executeCommand } from "../registry";
import { filterCommands } from "../fuzzy";
import { formatShortcutLabel } from "../keymap";
import type { CommandListItem } from "../types";
import { listCommands } from "../registry";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const query = ref("");
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const results = computed((): CommandListItem[] => filterCommands(listCommands(), query.value));

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    query.value = "";
    activeIndex.value = 0;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
  },
);

watch(results, () => {
  activeIndex.value = 0;
});

function close(): void {
  emit("close");
}

async function runAt(index: number): Promise<void> {
  const item = results.value[index];
  if (!item) return;
  close();
  await executeCommand(item.id);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (results.value.length === 0) return;
    activeIndex.value = (activeIndex.value + 1) % results.value.length;
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (results.value.length === 0) return;
    activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length;
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    void runAt(activeIndex.value);
  }
}
</script>

<template>
  <div v-if="open" class="mm-cmd-backdrop" @click.self="close">
    <div class="mm-cmd-panel" role="dialog" aria-label="命令面板" @keydown="onKeydown">
      <input
        ref="inputRef"
        v-model="query"
        class="mm-cmd-input"
        type="text"
        placeholder="输入命令名称…"
        autocomplete="off"
        spellcheck="false"
      />
      <ul class="mm-cmd-list">
        <li v-if="results.length === 0" class="mm-cmd-empty">无匹配命令</li>
        <li
          v-for="(item, index) in results"
          :key="item.id"
          class="mm-cmd-item"
          :class="{ 'mm-cmd-item--active': index === activeIndex }"
          @mouseenter="activeIndex = index"
          @click="runAt(index)"
        >
          <div class="mm-cmd-item__text">
            <span class="mm-cmd-item__title">{{ item.title }}</span>
            <span v-if="item.subtitle" class="mm-cmd-item__sub">{{ item.subtitle }}</span>
          </div>
          <kbd v-if="item.shortcut" class="mm-cmd-item__kbd">{{
            formatShortcutLabel(item.shortcut)
          }}</kbd>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.mm-cmd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  padding-top: min(18vh, 120px);
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(2px);
}

.mm-cmd-panel {
  width: min(520px, calc(100vw - 24px));
  max-height: min(60vh, 420px);
  display: flex;
  flex-direction: column;
  background: var(--mm-color-surface-elevated);
  color: var(--mm-color-text);
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-lg);
  box-shadow: var(--mm-shadow-overlay);
  overflow: hidden;
}

.mm-cmd-input {
  border: none;
  border-bottom: 1px solid var(--mm-color-border);
  background: transparent;
  color: inherit;
  padding: 16px 18px;
  font-size: 16px;
  outline: none;
}

.mm-cmd-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow: auto;
}

.mm-cmd-empty {
  padding: 16px;
  font-size: 13px;
  color: var(--mm-color-text-muted);
}

.mm-cmd-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 11px;
  border-radius: var(--mm-radius-sm);
  cursor: pointer;
}

.mm-cmd-item--active {
  background: var(--mm-color-active);
}

.mm-cmd-item__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mm-cmd-item__title {
  font-size: 13px;
}

.mm-cmd-item__sub {
  font-size: 11px;
  color: var(--mm-color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mm-cmd-item__kbd {
  flex-shrink: 0;
  font-family: inherit;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--mm-radius-sm);
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-bg-muted);
  color: var(--mm-color-text-muted);
}
</style>
