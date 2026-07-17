<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { runFormatCommand, type FormatAlign } from "../formatBridge";
import { useSettingsStore } from "../../settings";

const settingsStore = useSettingsStore();
const collapsed = ref(false);

const FONT_SIZES = [
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
];

const HEADINGS = [
  { label: "正文", level: 0 as const },
  { label: "标题 1", level: 1 as const },
  { label: "标题 2", level: 2 as const },
  { label: "标题 3", level: 3 as const },
  { label: "标题 4", level: 4 as const },
  { label: "标题 5", level: 5 as const },
  { label: "标题 6", level: 6 as const },
];

const LINE_HEIGHTS = [
  { label: "1.0", value: "1" },
  { label: "1.2", value: "1.2" },
  { label: "1.5", value: "1.5" },
  { label: "1.8", value: "1.8" },
  { label: "2.0", value: "2" },
  { label: "2.5", value: "2.5" },
];

const COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b42318",
  "#dc6803",
  "#ca8a04",
  "#16a34a",
  "#0284c7",
  "#4f46e5",
  "#9333ea",
  "#db2777",
];

const BG_COLORS = [
  "transparent",
  "#fef3c7",
  "#dcfce7",
  "#e0f2fe",
  "#ede9fe",
  "#fce7f3",
  "#fee2e2",
  "#f3f4f6",
];

const openPalette = ref<"font" | "bg" | null>(null);
const fontColor = computed(() => settingsStore.lastFontColor);
const bgColor = computed(() => settingsStore.lastBackgroundColor);
const fontGroupRef = ref<HTMLElement | null>(null);
const bgGroupRef = ref<HTMLElement | null>(null);
const paletteStyle = ref<{ top: string; left: string }>({ top: "0px", left: "0px" });
let colorPersistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersistColors(): void {
  if (colorPersistTimer) clearTimeout(colorPersistTimer);
  colorPersistTimer = setTimeout(() => {
    colorPersistTimer = null;
    void settingsStore.persist();
  }, 300);
}

function rememberFontColor(color: string): void {
  settingsStore.patch({ lastFontColor: color });
  schedulePersistColors();
}

function rememberBgColor(color: string): void {
  settingsStore.patch({ lastBackgroundColor: color });
  schedulePersistColors();
}

function placePalette(kind: "font" | "bg"): void {
  const el = kind === "font" ? fontGroupRef.value : bgGroupRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const panelW = 160;
  const panelH = 160;
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + panelW > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - panelW - 8);
  }
  if (top + panelH > window.innerHeight - 8) {
    top = Math.max(8, rect.top - panelH - 4);
  }
  paletteStyle.value = { top: `${top}px`, left: `${left}px` };
}

/** 工具栏按钮 mousedown 阻止抢焦点，保留编辑器选区；select/input 除外。 */
function keepEditorSelection(event: MouseEvent): void {
  const t = event.target;
  if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement) return;
  if (t instanceof Element && t.closest("select, input")) return;
  event.preventDefault();
}

function run(cmd: Parameters<typeof runFormatCommand>[0]): void {
  runFormatCommand(cmd);
  openPalette.value = null;
}

function onHeading(event: Event): void {
  const level = Number((event.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  run({ type: "heading", level });
  (event.target as HTMLSelectElement).selectedIndex = 0;
}

function onFontSize(event: Event): void {
  const size = (event.target as HTMLSelectElement).value;
  if (!size) return;
  run({ type: "fontSize", size });
  (event.target as HTMLSelectElement).selectedIndex = 0;
}

function onLineHeight(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (!value) return;
  run({ type: "lineHeight", value });
  (event.target as HTMLSelectElement).selectedIndex = 0;
}

/** 主按钮：直接套用上次颜色 */
function applyLastColor(kind: "font" | "bg"): void {
  if (kind === "font") {
    run({ type: "fontColor", color: fontColor.value });
  } else {
    run({ type: "backgroundColor", color: bgColor.value });
  }
}

function onFontColor(event: Event): void {
  const color = (event.target as HTMLInputElement).value;
  rememberFontColor(color);
  run({ type: "fontColor", color });
}

function onBgColor(event: Event): void {
  const color = (event.target as HTMLInputElement).value;
  rememberBgColor(color);
  run({ type: "backgroundColor", color });
}

function setAlign(align: FormatAlign): void {
  run({ type: "align", align });
}

function pickPresetColor(kind: "font" | "bg", color: string): void {
  if (kind === "font") {
    if (color === "transparent") return;
    rememberFontColor(color);
    run({ type: "fontColor", color });
  } else if (color === "transparent") {
    rememberBgColor("transparent");
    run({ type: "backgroundColor", color: "transparent" });
  } else {
    rememberBgColor(color);
    run({ type: "backgroundColor", color });
  }
}

/** 下拉箭头：打开/关闭色板 */
function togglePalette(kind: "font" | "bg"): void {
  if (openPalette.value === kind) {
    openPalette.value = null;
    return;
  }
  openPalette.value = kind;
  requestAnimationFrame(() => placePalette(kind));
}

function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
  openPalette.value = null;
}

function onDocPointerDown(event: PointerEvent): void {
  const t = event.target;
  if (!(t instanceof Element)) return;
  if (t.closest(".mm-format-toolbar__color")) return;
  if (t.closest(".mm-format-toolbar__palette")) return;
  openPalette.value = null;
}

function onWindowChange(): void {
  if (openPalette.value) placePalette(openPalette.value);
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, true);
  window.addEventListener("resize", onWindowChange);
  window.addEventListener("scroll", onWindowChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  window.removeEventListener("resize", onWindowChange);
  window.removeEventListener("scroll", onWindowChange, true);
  if (colorPersistTimer) {
    clearTimeout(colorPersistTimer);
    colorPersistTimer = null;
    void settingsStore.persist();
  }
});
</script>

<template>
  <div
    class="mm-format-toolbar"
    :class="{ 'mm-format-toolbar--collapsed': collapsed }"
    role="toolbar"
    aria-label="格式工具栏"
    @mousedown="keepEditorSelection"
  >
    <button
      type="button"
      class="mm-format-toolbar__toggle"
      :title="collapsed ? '展开格式工具栏' : '折叠格式工具栏'"
      :aria-expanded="!collapsed"
      @click="toggleCollapsed"
    >
      {{ collapsed ? "格式 ▾" : "格式 ▴" }}
    </button>

    <div v-show="!collapsed" class="mm-format-toolbar__row">
      <select
        class="mm-format-toolbar__select"
        title="字号（先选中文字）"
        aria-label="字号"
        @change="onFontSize"
      >
        <option value="">字号</option>
        <option v-for="s in FONT_SIZES" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <select
        class="mm-format-toolbar__select"
        title="正文与标题"
        aria-label="正文与标题"
        @change="onHeading"
      >
        <option value="">段落</option>
        <option v-for="h in HEADINGS" :key="h.level" :value="h.level">{{ h.label }}</option>
      </select>

      <div class="mm-format-toolbar__sep" aria-hidden="true"></div>

      <button type="button" class="mm-format-toolbar__btn" title="斜体" @click="run({ type: 'italic' })">
        <em>I</em>
      </button>
      <button
        type="button"
        class="mm-format-toolbar__btn"
        title="删除线"
        @click="run({ type: 'strikethrough' })"
      >
        <span class="mm-format-toolbar__strike">S</span>
      </button>
      <button type="button" class="mm-format-toolbar__btn" title="下划线" @click="run({ type: 'underline' })">
        <span class="mm-format-toolbar__u">U</span>
      </button>
      <button type="button" class="mm-format-toolbar__btn" title="上标" @click="run({ type: 'superscript' })">
        X<sup>2</sup>
      </button>
      <button type="button" class="mm-format-toolbar__btn" title="下标" @click="run({ type: 'subscript' })">
        X<sub>2</sub>
      </button>
      <button
        type="button"
        class="mm-format-toolbar__btn mm-format-toolbar__btn--mono"
        title="行内代码"
        @click="run({ type: 'inlineCode' })"
      >
        &lt;/&gt;
      </button>

      <div class="mm-format-toolbar__sep" aria-hidden="true"></div>

      <div ref="fontGroupRef" class="mm-format-toolbar__color">
        <button
          type="button"
          class="mm-format-toolbar__color-main"
          title="应用上次字体颜色（仅外观，不写入文件；先选中文字）"
          @click="applyLastColor('font')"
        >
          <span class="mm-format-toolbar__color-letter">A</span>
          <span class="mm-format-toolbar__color-bar" :style="{ background: fontColor }"></span>
        </button>
        <button
          type="button"
          class="mm-format-toolbar__color-caret"
          title="选择字体颜色"
          :aria-expanded="openPalette === 'font'"
          @click="togglePalette('font')"
        >
          ▾
        </button>
      </div>

      <div ref="bgGroupRef" class="mm-format-toolbar__color">
        <button
          type="button"
          class="mm-format-toolbar__color-main"
          title="应用上次背景颜色（仅外观，不写入文件；先选中文字）"
          @click="applyLastColor('bg')"
        >
          <span class="mm-format-toolbar__color-letter mm-format-toolbar__color-letter--bg">▮</span>
          <span
            class="mm-format-toolbar__color-bar"
            :style="{
              background: bgColor === 'transparent' ? 'var(--mm-color-surface)' : bgColor,
            }"
          ></span>
        </button>
        <button
          type="button"
          class="mm-format-toolbar__color-caret"
          title="选择背景颜色"
          :aria-expanded="openPalette === 'bg'"
          @click="togglePalette('bg')"
        >
          ▾
        </button>
      </div>

      <div class="mm-format-toolbar__sep" aria-hidden="true"></div>

      <button type="button" class="mm-format-toolbar__btn" title="左对齐" @click="setAlign('left')">左</button>
      <button type="button" class="mm-format-toolbar__btn" title="居中" @click="setAlign('center')">中</button>
      <button type="button" class="mm-format-toolbar__btn" title="右对齐" @click="setAlign('right')">右</button>
      <button type="button" class="mm-format-toolbar__btn" title="两端对齐" @click="setAlign('justify')">齐</button>

      <div class="mm-format-toolbar__sep" aria-hidden="true"></div>

      <button
        type="button"
        class="mm-format-toolbar__btn"
        title="无序列表"
        @click="run({ type: 'unorderedList' })"
      >
        •
      </button>
      <button
        type="button"
        class="mm-format-toolbar__btn"
        title="有序列表"
        @click="run({ type: 'orderedList' })"
      >
        1.
      </button>
      <button type="button" class="mm-format-toolbar__btn" title="增加缩进" @click="run({ type: 'indent' })">
        →
      </button>
      <button type="button" class="mm-format-toolbar__btn" title="减少缩进" @click="run({ type: 'outdent' })">
        ←
      </button>

      <div class="mm-format-toolbar__sep" aria-hidden="true"></div>

      <select
        class="mm-format-toolbar__select"
        title="行高（先选中文字）"
        aria-label="行高"
        @change="onLineHeight"
      >
        <option value="">行高</option>
        <option v-for="lh in LINE_HEIGHTS" :key="lh.value" :value="lh.value">{{ lh.label }}</option>
      </select>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="openPalette"
      class="mm-format-toolbar__palette"
      :style="paletteStyle"
      @mousedown.stop
    >
      <div class="mm-format-toolbar__palette-title">
        {{ openPalette === "font" ? "字体颜色" : "背景颜色" }}
      </div>
      <div class="mm-format-toolbar__swatches">
        <button
          v-for="c in openPalette === 'font' ? COLORS : BG_COLORS"
          :key="openPalette + '-' + c"
          type="button"
          class="mm-format-toolbar__swatch"
          :class="{ 'mm-format-toolbar__swatch--clear': c === 'transparent' }"
          :style="{ background: c === 'transparent' ? 'var(--mm-color-surface)' : c }"
          :title="c"
          @click="pickPresetColor(openPalette, c)"
        ></button>
      </div>
      <label class="mm-format-toolbar__custom">
        自定义
        <input
          type="color"
          :value="openPalette === 'font' ? fontColor : bgColor"
          @input="openPalette === 'font' ? onFontColor($event) : onBgColor($event)"
        />
      </label>
    </div>
  </Teleport>
</template>

<style scoped>
.mm-format-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-bottom: 1px solid var(--mm-color-border);
  background: var(--mm-color-surface);
  flex-shrink: 0;
  height: 34px;
  min-height: 34px;
  max-height: 34px;
  box-sizing: border-box;
  overflow: visible;
}

.mm-format-toolbar--collapsed {
  justify-content: flex-start;
}

.mm-format-toolbar__toggle {
  flex: none;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  background: var(--mm-color-bg-muted);
  color: var(--mm-color-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
}

.mm-format-toolbar__toggle:hover {
  background: var(--mm-color-hover);
}

.mm-format-toolbar__row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 3px;
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: thin;
}

.mm-format-toolbar__select {
  flex: none;
  height: 26px;
  padding: 0 4px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  background: var(--mm-color-bg-muted);
  color: var(--mm-color-text);
  font: inherit;
  font-size: 12px;
  max-width: 72px;
}

.mm-format-toolbar__btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 5px;
  border: 1px solid transparent;
  border-radius: var(--mm-radius-sm);
  background: transparent;
  color: var(--mm-color-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.mm-format-toolbar__btn:hover {
  background: var(--mm-color-hover);
  border-color: var(--mm-color-border);
}

.mm-format-toolbar__btn--mono {
  font-family: var(--mm-font-mono, Consolas, monospace);
  font-size: 11px;
}

.mm-format-toolbar__strike {
  text-decoration: line-through;
}

.mm-format-toolbar__u {
  text-decoration: underline;
}

.mm-format-toolbar__sep {
  flex: none;
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--mm-color-border);
}

.mm-format-toolbar__color {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  flex: none;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  overflow: hidden;
  background: var(--mm-color-bg-muted);
}

.mm-format-toolbar__color-main {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 26px;
  height: 24px;
  padding: 1px 3px 2px;
  border: none;
  border-right: 1px solid var(--mm-color-border);
  background: transparent;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}

.mm-format-toolbar__color-main:hover,
.mm-format-toolbar__color-caret:hover {
  background: var(--mm-color-hover);
}

.mm-format-toolbar__color-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--mm-color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 9px;
  line-height: 1;
}

.mm-format-toolbar__color-letter {
  font-size: 12px;
  font-weight: 700;
  color: var(--mm-color-text);
}

.mm-format-toolbar__color-letter--bg {
  font-size: 10px;
}

.mm-format-toolbar__color-bar {
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 1px;
}

.mm-format-toolbar__palette {
  position: fixed;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 160px;
  padding: 8px;
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-md);
  background: var(--mm-color-surface-elevated, var(--mm-color-surface));
  box-shadow: var(--mm-shadow-overlay, 0 4px 16px rgba(0, 0, 0, 0.12));
  box-sizing: border-box;
}

.mm-format-toolbar__palette-title {
  font-size: 11px;
  color: var(--mm-color-text-muted);
}

.mm-format-toolbar__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mm-format-toolbar__swatch {
  width: 18px;
  height: 18px;
  border: 1px solid var(--mm-color-border);
  border-radius: 3px;
  padding: 0;
  cursor: pointer;
}

.mm-format-toolbar__swatch--clear {
  background-image: linear-gradient(
    45deg,
    transparent 46%,
    var(--mm-color-danger, #b42318) 46%,
    var(--mm-color-danger, #b42318) 54%,
    transparent 54%
  );
}

.mm-format-toolbar__custom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--mm-color-text);
}

.mm-format-toolbar__custom input[type="color"] {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--mm-color-border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
</style>
