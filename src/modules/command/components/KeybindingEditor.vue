<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { formatShortcutLabel, parseShortcut } from "../keymap";
import { getCommand, listCommands } from "../registry";

const props = defineProps<{
  overrides: Record<string, string>;
}>();

const emit = defineEmits<{
  change: [overrides: Record<string, string>];
}>();

const local = ref<Record<string, string>>({ ...props.overrides });
const errorId = ref<string | null>(null);

watch(
  () => props.overrides,
  (next) => {
    local.value = { ...next };
  },
  { deep: true },
);

const rows = computed(() =>
  listCommands().map((cmd) => ({
    id: cmd.id,
    title: cmd.title,
    defaultShortcut: cmd.defaultShortcut ?? "",
  })),
);

function onInput(id: string, event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim();
  errorId.value = null;
  if (value && !parseShortcut(value)) {
    errorId.value = id;
    return;
  }
  const next = { ...local.value };
  const command = getCommand(id);
  const fallback = command?.defaultShortcut ?? "";
  if (!value || value === fallback) {
    delete next[id];
  } else {
    next[id] = value;
  }
  local.value = next;
  emit("change", { ...next });
}

function resetOne(id: string): void {
  const next = { ...local.value };
  delete next[id];
  local.value = next;
  errorId.value = null;
  emit("change", { ...next });
}

function displayEffective(id: string): string {
  const command = getCommand(id);
  if (!command) return "";
  const raw = local.value[id] || command.defaultShortcut;
  return raw ? formatShortcutLabel(raw) : "无";
}

function inputValue(id: string, defaultShortcut: string): string {
  return local.value[id] ?? defaultShortcut;
}
</script>

<template>
  <div class="mm-kb">
    <p class="mm-kb__hint">格式示例：Mod-s、Mod-Shift-p、Alt-t（Mod 在 Windows 为 Ctrl，Mac 为 ⌘）</p>
    <div v-for="row in rows" :key="row.id" class="mm-kb__row">
      <div class="mm-kb__meta">
        <span class="mm-kb__title">{{ row.title }}</span>
        <span class="mm-kb__eff">当前：{{ displayEffective(row.id) }}</span>
      </div>
      <input
        class="mm-kb__input"
        type="text"
        :value="inputValue(row.id, row.defaultShortcut)"
        :placeholder="row.defaultShortcut || '无默认'"
        @change="onInput(row.id, $event)"
      />
      <button type="button" class="mm-kb__reset" title="恢复默认" @click="resetOne(row.id)">
        默认
      </button>
      <span v-if="errorId === row.id" class="mm-kb__err">格式无效</span>
    </div>
  </div>
</template>

<style scoped>
.mm-kb__hint {
  margin: 0 0 10px;
  font-size: 11px;
  color: var(--mm-color-text-muted);
}

.mm-kb__row {
  display: grid;
  grid-template-columns: 1fr minmax(120px, 160px) auto;
  gap: 6px 8px;
  align-items: center;
  margin-bottom: 8px;
}

.mm-kb__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mm-kb__title {
  font-size: 12px;
}

.mm-kb__eff {
  font-size: 10px;
  color: var(--mm-color-text-muted, #666);
}

.mm-kb__input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: inherit;
  border-radius: var(--mm-radius-sm);
  padding: 5px 7px;
  font-size: 12px;
  outline: none;
}

.mm-kb__input:focus {
  border-color: var(--mm-color-accent);
  box-shadow: 0 0 0 3px var(--mm-color-accent-soft);
}

.mm-kb__reset {
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: inherit;
  border-radius: var(--mm-radius-sm);
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}

.mm-kb__err {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--mm-color-danger);
}
</style>
