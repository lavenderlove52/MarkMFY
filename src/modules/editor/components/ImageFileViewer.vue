<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  src: string;
  fileName: string;
}>();

const loadError = ref(false);
const dimensions = ref("");
const stageRef = ref<HTMLDivElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const zoomLabel = ref("适应");
let zoom = 1;
let fitScale = 1;
let resizeFrame: number | null = null;
let resizeObserver: ResizeObserver | null = null;

watch(
  () => props.src,
  () => {
    loadError.value = false;
    dimensions.value = "";
    zoom = 1;
    fitScale = 1;
    zoomLabel.value = "适应";
    const image = imageRef.value;
    if (image) {
      image.style.width = "";
      image.style.height = "";
      image.style.maxWidth = "";
      image.style.maxHeight = "";
    }
    if (stageRef.value) {
      stageRef.value.scrollLeft = 0;
      stageRef.value.scrollTop = 0;
    }
  },
);

function onLoad(event: Event): void {
  const image = event.target as HTMLImageElement;
  dimensions.value = `${image.naturalWidth} × ${image.naturalHeight}`;
  requestAnimationFrame(() => applyZoom(1));
}

function applyZoom(next: number, pointer?: { clientX: number; clientY: number }): void {
  const stage = stageRef.value;
  const image = imageRef.value;
  if (!stage || !image || !image.naturalWidth || !image.naturalHeight) return;
  const imageRect = image.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  if (imageRect.width <= 0 || imageRect.height <= 0) return;

  const pointerOnImage =
    pointer != null &&
    pointer.clientX >= imageRect.left &&
    pointer.clientX <= imageRect.right &&
    pointer.clientY >= imageRect.top &&
    pointer.clientY <= imageRect.bottom;
  const anchorClientX = pointerOnImage ? pointer.clientX : imageRect.left + imageRect.width / 2;
  const anchorClientY = pointerOnImage ? pointer.clientY : imageRect.top + imageRect.height / 2;
  const ratioX = Math.max(0, Math.min(1, (anchorClientX - imageRect.left) / imageRect.width));
  const ratioY = Math.max(0, Math.min(1, (anchorClientY - imageRect.top) / imageRect.height));
  const viewportX = anchorClientX - stageRect.left;
  const viewportY = anchorClientY - stageRect.top;

  const availableW = Math.max(120, stage.clientWidth - 48);
  const availableH = Math.max(120, stage.clientHeight - 48);
  fitScale = Math.min(1, availableW / image.naturalWidth, availableH / image.naturalHeight);
  zoom = Math.max(0.25, Math.min(4, next));
  const scale = fitScale * zoom;
  image.style.maxWidth = "none";
  image.style.maxHeight = "none";
  image.style.width = `${Math.max(1, Math.round(image.naturalWidth * scale))}px`;
  image.style.height = `${Math.max(1, Math.round(image.naturalHeight * scale))}px`;
  zoomLabel.value = `${Math.round(scale * 100)}%`;

  const nextRect = image.getBoundingClientRect();
  const nextStageRect = stage.getBoundingClientRect();
  stage.scrollLeft += nextRect.left + ratioX * nextRect.width - (nextStageRect.left + viewportX);
  stage.scrollTop += nextRect.top + ratioY * nextRect.height - (nextStageRect.top + viewportY);
}

function zoomIn(): void {
  applyZoom(zoom * 1.25);
}

function zoomOut(): void {
  applyZoom(zoom / 1.25);
}

function resetZoom(): void {
  applyZoom(1);
}

function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey) return;
  event.preventDefault();
  applyZoom(zoom * Math.exp(-event.deltaY * 0.0015), event);
}

function onDoubleClick(event: MouseEvent): void {
  applyZoom(zoom > 1.001 ? 1 : 1 / Math.max(fitScale, 0.01), event);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomIn();
  } else if (event.key === "-") {
    event.preventDefault();
    zoomOut();
  } else if (event.key === "0") {
    event.preventDefault();
    resetZoom();
  }
}

let dragPointerId: number | null = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartScrollLeft = 0;
let dragStartScrollTop = 0;
let moved = false;

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !imageRef.value || !stageRef.value) return;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartScrollLeft = stageRef.value.scrollLeft;
  dragStartScrollTop = stageRef.value.scrollTop;
  moved = false;
  imageRef.value.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  const stage = stageRef.value;
  if (!stage || dragPointerId !== event.pointerId) return;
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  if (!moved && Math.hypot(dx, dy) > 3) {
    moved = true;
    stage.classList.add("image-file-viewer__stage--dragging");
    event.preventDefault();
  }
  if (!moved) return;
  stage.scrollLeft = dragStartScrollLeft - dx;
  stage.scrollTop = dragStartScrollTop - dy;
}

function onPointerEnd(event: PointerEvent): void {
  const image = imageRef.value;
  if (dragPointerId !== event.pointerId) return;
  dragPointerId = null;
  moved = false;
  stageRef.value?.classList.remove("image-file-viewer__stage--dragging");
  if (image?.hasPointerCapture(event.pointerId)) {
    image.releasePointerCapture(event.pointerId);
  }
}

onMounted(() => {
  const stage = stageRef.value;
  if (!stage || typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame != null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      applyZoom(zoom);
    });
  });
  resizeObserver.observe(stage);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
});
</script>

<template>
  <div class="image-file-viewer">
    <div
      ref="stageRef"
      class="image-file-viewer__stage"
      tabindex="0"
      @wheel="onWheel"
      @keydown="onKeydown"
    >
      <img
        v-if="!loadError"
        ref="imageRef"
        class="image-file-viewer__image"
        :src="src"
        :alt="fileName"
        draggable="false"
        title="Ctrl+滚轮缩放，左键拖动"
        @load="onLoad"
        @dblclick="onDoubleClick"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @error="loadError = true"
      />
      <p v-else class="image-file-viewer__error">图片加载失败：{{ fileName }}</p>
    </div>
    <footer class="image-file-viewer__bar">
      <span class="image-file-viewer__name" :title="fileName">{{ fileName }}</span>
      <span v-if="dimensions" class="image-file-viewer__size">{{ dimensions }}</span>
      <div class="image-file-viewer__zoom" :aria-disabled="loadError">
        <button
          type="button"
          class="image-file-viewer__zoom-btn"
          :disabled="loadError"
          @click="zoomOut"
        >
          −
        </button>
        <button
          type="button"
          class="image-file-viewer__zoom-value"
          :disabled="loadError"
          title="恢复适应窗口"
          @click="resetZoom"
        >
          {{ zoomLabel }}
        </button>
        <button
          type="button"
          class="image-file-viewer__zoom-btn"
          :disabled="loadError"
          @click="zoomIn"
        >
          +
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.image-file-viewer {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  background: var(--mm-color-editor, var(--mm-color-bg));
}

.image-file-viewer__stage {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow: auto;
  cursor: grab;
  user-select: none;
  scrollbar-gutter: stable;
  background:
    linear-gradient(
        45deg,
        color-mix(in srgb, var(--mm-color-border) 28%, transparent) 25%,
        transparent 25%
      )
      0 0 / 20px 20px,
    linear-gradient(
        -45deg,
        color-mix(in srgb, var(--mm-color-border) 28%, transparent) 25%,
        transparent 25%
      )
      0 10px / 20px 20px,
    linear-gradient(
        45deg,
        transparent 75%,
        color-mix(in srgb, var(--mm-color-border) 28%, transparent) 75%
      )
      10px -10px / 20px 20px,
    linear-gradient(
        -45deg,
        transparent 75%,
        color-mix(in srgb, var(--mm-color-border) 28%, transparent) 75%
      ) -10px
      0 / 20px 20px,
    var(--mm-color-bg-muted);
}

.image-file-viewer__stage--dragging {
  cursor: grabbing;
}

.image-file-viewer__image {
  display: block;
  max-width: none;
  max-height: none;
  width: auto;
  height: auto;
  object-fit: contain;
  margin: auto;
  border-radius: var(--mm-radius-sm);
  box-shadow: var(--mm-shadow-panel);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.image-file-viewer__error {
  margin: 0;
  color: var(--mm-color-text-muted);
  font-size: 13px;
}

.image-file-viewer__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  padding: 0 12px;
  border-top: 1px solid var(--mm-color-border);
  background: var(--mm-color-bg-muted);
  color: var(--mm-color-text-muted);
  font-size: 12px;
}

.image-file-viewer__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-file-viewer__size {
  margin-left: auto;
  flex-shrink: 0;
}

.image-file-viewer__zoom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.image-file-viewer__zoom-btn,
.image-file-viewer__zoom-value {
  border: 1px solid var(--mm-color-border);
  border-radius: var(--mm-radius-sm);
  background: var(--mm-color-surface);
  color: var(--mm-color-text);
  font: inherit;
  cursor: pointer;
}

.image-file-viewer__zoom-btn {
  width: 26px;
  height: 24px;
  padding: 0;
  font-size: 15px;
  line-height: 1;
}

.image-file-viewer__zoom-value {
  min-width: 52px;
  height: 24px;
  padding: 0 7px;
  font-size: 11px;
}

.image-file-viewer__zoom-btn:hover:not(:disabled),
.image-file-viewer__zoom-value:hover:not(:disabled) {
  border-color: var(--mm-color-accent);
  background: var(--mm-color-hover);
}

.image-file-viewer__zoom-btn:disabled,
.image-file-viewer__zoom-value:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
