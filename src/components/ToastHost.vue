<script setup lang="ts">
import { toastState, dismissToast } from "../notify";

const state = toastState();
</script>

<template>
  <div class="mm-toast-host" aria-live="polite" aria-relevant="additions">
    <div
      v-for="item in state.items"
      :key="item.id"
      class="mm-toast"
      :class="`mm-toast--${item.kind}`"
      role="status"
      @click="dismissToast(item.id)"
    >
      {{ item.message }}
    </div>
  </div>
</template>

<style scoped>
.mm-toast-host {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.mm-toast {
  pointer-events: auto;
  padding: 10px 14px;
  border-radius: var(--mm-radius-sm);
  font-size: 13px;
  line-height: 1.4;
  box-shadow: var(--mm-shadow-overlay);
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface-elevated);
  color: var(--mm-color-text);
  cursor: pointer;
  word-break: break-word;
}

.mm-toast--error {
  border-color: var(--mm-color-danger);
  background: var(--mm-color-danger-soft);
  color: var(--mm-color-danger);
}

.mm-toast--success {
  border-color: var(--mm-color-success);
  background: var(--mm-color-success-soft);
  color: var(--mm-color-success);
}

.mm-toast--info {
  opacity: 0.98;
}
</style>
