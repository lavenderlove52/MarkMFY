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
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  border: 1px solid var(--mm-color-border);
  background: var(--mm-color-panel, var(--mm-color-bg));
  color: var(--mm-color-text);
  cursor: pointer;
  word-break: break-word;
}

.mm-toast--error {
  border-color: #c44;
  background: #fff5f5;
  color: #8b1a1a;
}

.mm-toast--success {
  border-color: var(--mm-color-accent, #2a7);
}

.mm-toast--info {
  opacity: 0.98;
}

:root.dark .mm-toast--error,
html[data-theme="dark"] .mm-toast--error {
  background: #3a1a1a;
  color: #ffb4b4;
  border-color: #a44;
}
</style>
