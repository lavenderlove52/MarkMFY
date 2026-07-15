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
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.unsaved-dialog {
  background: var(--mm-color-bg, #fff);
  color: var(--mm-color-text, #1f1f1f);
  border-radius: 8px;
  padding: 20px 24px;
  min-width: 320px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
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
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: transparent;
  cursor: pointer;
  font-size: 13px;
}

.unsaved-dialog__btn--primary {
  background: #396cd8;
  color: #fff;
  border-color: #396cd8;
}
</style>
