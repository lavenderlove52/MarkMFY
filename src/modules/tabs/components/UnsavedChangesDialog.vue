<script setup lang="ts">
defineProps<{
  fileName: string;
}>();

const emit = defineEmits<{
  save: [];
  discard: [];
  cancel: [];
}>();
</script>

<template>
  <div class="unsaved-dialog-overlay" @click.self="emit('cancel')">
    <div class="unsaved-dialog">
      <p class="unsaved-dialog__message">"{{ fileName }}" 有未保存的修改，是否保存？</p>
      <div class="unsaved-dialog__actions">
        <button type="button" class="unsaved-dialog__btn unsaved-dialog__btn--primary" @click="emit('save')">
          保存
        </button>
        <button type="button" class="unsaved-dialog__btn" @click="emit('discard')">不保存</button>
        <button type="button" class="unsaved-dialog__btn" @click="emit('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unsaved-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.unsaved-dialog {
  background: var(--mm-color-surface-elevated);
  color: var(--mm-color-text);
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-lg);
  padding: 20px 24px;
  min-width: 320px;
  box-shadow: var(--mm-shadow-overlay);
}

.unsaved-dialog__message {
  margin: 0 0 16px;
  font-size: 14px;
  word-break: break-all;
}

.unsaved-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.unsaved-dialog__btn {
  padding: 6px 14px;
  border-radius: var(--mm-radius-sm);
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: var(--mm-color-text);
  cursor: pointer;
  font-size: 13px;
}

.unsaved-dialog__btn--primary {
  background: var(--mm-color-accent);
  color: #fff;
  border-color: var(--mm-color-accent);
}
</style>
