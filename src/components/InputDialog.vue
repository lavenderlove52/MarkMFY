<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    label: string;
    initialValue?: string;
    confirmText?: string;
    cancelText?: string;
  }>(),
  {
    initialValue: "",
    confirmText: "确定",
    cancelText: "取消",
  },
);

const emit = defineEmits<{
  confirm: [value: string];
  cancel: [];
}>();

const value = ref(props.initialValue);
const input = ref<HTMLInputElement | null>(null);

watch(
  () => [props.open, props.initialValue] as const,
  async ([open]) => {
    if (!open) return;
    value.value = props.initialValue;
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
);

function submit(): void {
  emit("confirm", value.value.trim());
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mm-input-dialog" role="presentation" @mousedown.self="emit('cancel')">
      <form
        class="mm-input-dialog__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @submit.prevent="submit"
        @keydown.esc.prevent="emit('cancel')"
      >
        <h2 class="mm-input-dialog__title">{{ title }}</h2>
        <label class="mm-input-dialog__label">
          <span>{{ label }}</span>
          <input
            ref="input"
            v-model="value"
            class="mm-input-dialog__input"
            type="text"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <div class="mm-input-dialog__actions">
          <button type="button" class="mm-input-dialog__btn" @click="emit('cancel')">
            {{ cancelText }}
          </button>
          <button type="submit" class="mm-input-dialog__btn mm-input-dialog__btn--primary">
            {{ confirmText }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.mm-input-dialog {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(16, 21, 24, 0.42);
  backdrop-filter: blur(2px);
}

.mm-input-dialog__panel {
  width: min(420px, 100%);
  box-sizing: border-box;
  padding: 20px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-lg);
  background: var(--mm-color-surface-elevated);
  color: var(--mm-color-text);
  box-shadow: var(--mm-shadow-overlay);
}

.mm-input-dialog__title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}

.mm-input-dialog__label {
  display: grid;
  gap: 8px;
  color: var(--mm-color-text-muted);
  font-size: 13px;
}

.mm-input-dialog__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--mm-color-border-strong);
  border-radius: var(--mm-radius-sm);
  outline: none;
  background: var(--mm-color-surface);
  color: var(--mm-color-text);
  font: inherit;
}

.mm-input-dialog__input:focus {
  border-color: var(--mm-color-focus-ring);
  box-shadow: 0 0 0 2px var(--mm-color-accent-soft);
}

.mm-input-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.mm-input-dialog__btn {
  min-width: 72px;
  padding: 7px 14px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  background: var(--mm-color-surface);
  color: var(--mm-color-text);
  font: inherit;
  cursor: pointer;
}

.mm-input-dialog__btn:hover {
  background: var(--mm-color-hover);
}

.mm-input-dialog__btn--primary {
  border-color: var(--mm-color-accent);
  background: var(--mm-color-accent);
  color: #fff;
}

.mm-input-dialog__btn--primary:hover {
  border-color: var(--mm-color-accent-hover);
  background: var(--mm-color-accent-hover);
}
</style>
