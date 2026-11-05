<script setup lang="ts">
defineProps<{
  fileName: string;
  /** 编辑器里是否有相对上次保存尚未写盘的修改，决定展示哪些操作按钮。 */
  hasLocalEdits: boolean;
}>();

const emit = defineEmits<{
  keepCurrent: [];
  loadDisk: [];
  dismiss: [];
}>();
</script>

<template>
  <div class="external-change-overlay" @click.self="emit('dismiss')">
    <div class="external-change-dialog">
      <p class="external-change-dialog__message">
        "{{ fileName }}" 已在其它程序中被修改。
        <template v-if="hasLocalEdits">你在编辑器中还有未保存的修改，请选择保留哪一份：</template>
        <template v-else>是否重新加载磁盘上的最新内容？</template>
      </p>
      <div class="external-change-dialog__actions">
        <button
          v-if="hasLocalEdits"
          type="button"
          class="external-change-dialog__btn external-change-dialog__btn--primary"
          @click="emit('keepCurrent')"
        >
          保存已经打开的
        </button>
        <button
          type="button"
          class="external-change-dialog__btn"
          :class="{ 'external-change-dialog__btn--primary': !hasLocalEdits }"
          @click="emit('loadDisk')"
        >
          加载外部修改后的
        </button>
        <button type="button" class="external-change-dialog__btn" @click="emit('dismiss')">
          暂不处理
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.external-change-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.external-change-dialog {
  background: var(--mm-color-surface-elevated);
  color: var(--mm-color-text);
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-lg);
  padding: 20px 24px;
  min-width: 340px;
  max-width: 420px;
  box-shadow: var(--mm-shadow-overlay);
}

.external-change-dialog__message {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}

.external-change-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.external-change-dialog__btn {
  padding: 6px 14px;
  border-radius: var(--mm-radius-sm);
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  color: var(--mm-color-text);
  cursor: pointer;
  font-size: 13px;
}

.external-change-dialog__btn--primary {
  background: var(--mm-color-accent);
  color: #fff;
  border-color: var(--mm-color-accent);
}
</style>
