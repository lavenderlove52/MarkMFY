<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { KeybindingEditor } from "../../command";
import { useSettingsStore } from "../store";
import type { ThemeMode } from "../types";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  /** 快捷键覆盖变更后通知 App 同步 registry */
  keybindingsChange: [overrides: Record<string, string>];
}>();

const settings = useSettingsStore();
const localTheme = ref<ThemeMode>(settings.theme);
const localFontFamily = ref(settings.editorFontFamily);
const localFontSize = ref(settings.editorFontSize);
const localKeybindings = ref<Record<string, string>>({ ...settings.keybindings });
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const fontPresets = [
  { label: "系统 UI", value: '"Segoe UI", system-ui, -apple-system, sans-serif' },
  { label: "衬线", value: 'Georgia, "Times New Roman", serif' },
  { label: "等宽", value: 'Consolas, "Courier New", monospace' },
];

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localTheme.value = settings.theme;
    localFontFamily.value = settings.editorFontFamily;
    localFontSize.value = settings.editorFontSize;
    localKeybindings.value = { ...settings.keybindings };
  },
);

const fontSizeLabel = computed(() => `${localFontSize.value}px`);

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void settings.persist();
  }, 400);
}

function applyAndPersist(): void {
  settings.patch({
    theme: localTheme.value,
    editorFontFamily: localFontFamily.value,
    editorFontSize: localFontSize.value,
    keybindings: { ...localKeybindings.value },
  });
  schedulePersist();
}

function onThemeChange(theme: ThemeMode): void {
  localTheme.value = theme;
  applyAndPersist();
}

function onFontPreset(value: string): void {
  localFontFamily.value = value;
  applyAndPersist();
}

function onFontFamilyInput(event: Event): void {
  localFontFamily.value = (event.target as HTMLInputElement).value;
  applyAndPersist();
}

function onFontSizeInput(event: Event): void {
  localFontSize.value = Number((event.target as HTMLInputElement).value);
  applyAndPersist();
}

function onKeybindingsChange(overrides: Record<string, string>): void {
  localKeybindings.value = { ...overrides };
  applyAndPersist();
  emit("keybindingsChange", { ...overrides });
}

function onBackdropClick(): void {
  emit("close");
}

onBeforeUnmount(() => {
  if (persistTimer) clearTimeout(persistTimer);
});
</script>

<template>
  <div v-if="open" class="mm-settings-backdrop" @click.self="onBackdropClick">
    <div class="mm-settings-panel" role="dialog" aria-label="设置">
      <header class="mm-settings-panel__header">
        <h2 class="mm-settings-panel__title">设置</h2>
        <button type="button" class="mm-settings-panel__close" @click="emit('close')">关闭</button>
      </header>

      <section class="mm-settings-section">
        <h3 class="mm-settings-section__title">外观</h3>
        <div class="mm-settings-row">
          <span class="mm-settings-row__label">主题</span>
          <div class="mm-settings-row__controls">
            <button
              type="button"
              class="mm-settings-chip"
              :class="{ 'mm-settings-chip--active': localTheme === 'light' }"
              @click="onThemeChange('light')"
            >
              浅色
            </button>
            <button
              type="button"
              class="mm-settings-chip"
              :class="{ 'mm-settings-chip--active': localTheme === 'dark' }"
              @click="onThemeChange('dark')"
            >
              深色
            </button>
          </div>
        </div>
      </section>

      <section class="mm-settings-section">
        <h3 class="mm-settings-section__title">编辑器</h3>
        <div class="mm-settings-row">
          <span class="mm-settings-row__label">字体预设</span>
          <div class="mm-settings-row__controls">
            <button
              v-for="preset in fontPresets"
              :key="preset.label"
              type="button"
              class="mm-settings-chip"
              :class="{ 'mm-settings-chip--active': localFontFamily === preset.value }"
              @click="onFontPreset(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
        <div class="mm-settings-row mm-settings-row--stack">
          <span class="mm-settings-row__label">字体族</span>
          <input
            class="mm-settings-input"
            type="text"
            :value="localFontFamily"
            @input="onFontFamilyInput"
          />
        </div>
        <div class="mm-settings-row">
          <span class="mm-settings-row__label">字号 {{ fontSizeLabel }}</span>
          <input
            class="mm-settings-range"
            type="range"
            min="10"
            max="28"
            step="1"
            :value="localFontSize"
            @input="onFontSizeInput"
          />
        </div>
      </section>

      <section class="mm-settings-section">
        <h3 class="mm-settings-section__title">快捷键</h3>
        <KeybindingEditor :overrides="localKeybindings" @change="onKeybindingsChange" />
      </section>

      <p class="mm-settings-hint">修改会立即生效，并自动保存到本地配置。</p>
    </div>
  </div>
</template>

<style scoped>
.mm-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.mm-settings-panel {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--mm-color-panel, #fff);
  color: var(--mm-color-text, #1f1f1f);
  border: 1px solid var(--mm-color-border, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  padding: 16px 18px 18px;
}

.mm-settings-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.mm-settings-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.mm-settings-panel__close {
  border: 1px solid var(--mm-color-border, rgba(0, 0, 0, 0.15));
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}

.mm-settings-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--mm-color-border, rgba(0, 0, 0, 0.08));
}

.mm-settings-section__title {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--mm-color-text-muted, #666);
  font-weight: 600;
}

.mm-settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.mm-settings-row--stack {
  flex-direction: column;
  align-items: stretch;
}

.mm-settings-row__label {
  flex: 0 0 88px;
  font-size: 13px;
}

.mm-settings-row--stack .mm-settings-row__label {
  flex: none;
}

.mm-settings-row__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mm-settings-chip {
  border: 1px solid var(--mm-color-border, rgba(0, 0, 0, 0.15));
  background: var(--mm-color-bg-muted, #f6f7f9);
  color: inherit;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}

.mm-settings-chip--active {
  border-color: var(--mm-color-accent, #396cd8);
  background: var(--mm-color-accent, #396cd8);
  color: #fff;
}

.mm-settings-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--mm-color-border, rgba(0, 0, 0, 0.15));
  background: var(--mm-color-bg, #fff);
  color: inherit;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
}

.mm-settings-range {
  flex: 1;
}

.mm-settings-hint {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--mm-color-text-muted, #666);
}
</style>
