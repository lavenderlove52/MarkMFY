/**
 * 当前文档统计（字数/行数/字节），由 Editor 在文档变更时更新。
 * StatusBar 只读此状态，避免深路径耦合。
 */
import { shallowRef } from "vue";
import type { Text } from "@codemirror/state";

export interface EditorDocStats {
  /** Unicode 码点数（中文按字计） */
  chars: number;
  lines: number;
  /** UTF-8 字节数 */
  bytes: number;
}

export const editorDocStats = shallowRef<EditorDocStats | null>(null);

let statsTimer: ReturnType<typeof setTimeout> | null = null;

export function clearEditorDocStats(): void {
  if (statsTimer != null) {
    clearTimeout(statsTimer);
    statsTimer = null;
  }
  editorDocStats.value = null;
}

/** 从纯文本计算统计（回退 textarea / 初始内容）。 */
export function computeDocStatsFromText(text: string): EditorDocStats {
  const chars = Array.from(text).length;
  const lines = text.length === 0 ? 1 : text.split("\n").length;
  const bytes = new TextEncoder().encode(text).length;
  return { chars, lines, bytes };
}

/** 从 CM6 Text 计算：行数 O(1)，字数/字节扫一遍。 */
export function computeDocStatsFromDoc(doc: Text): EditorDocStats {
  const lines = doc.lines;
  let chars = 0;
  let bytes = 0;
  const encoder = new TextEncoder();
  const iter = doc.iter();
  for (let chunk = iter.next(); !chunk.done; chunk = iter.next()) {
    const value = chunk.value;
    chars += Array.from(value).length;
    bytes += encoder.encode(value).length;
  }
  return { chars, lines, bytes };
}

export function publishEditorDocStats(doc: Text, immediate = false): void {
  const run = (): void => {
    statsTimer = null;
    editorDocStats.value = computeDocStatsFromDoc(doc);
  };
  if (immediate) {
    if (statsTimer != null) {
      clearTimeout(statsTimer);
      statsTimer = null;
    }
    run();
    return;
  }
  if (statsTimer != null) clearTimeout(statsTimer);
  statsTimer = setTimeout(run, 120);
}

export function publishEditorDocStatsFromText(text: string, immediate = false): void {
  const run = (): void => {
    statsTimer = null;
    editorDocStats.value = computeDocStatsFromText(text);
  };
  if (immediate) {
    if (statsTimer != null) {
      clearTimeout(statsTimer);
      statsTimer = null;
    }
    run();
    return;
  }
  if (statsTimer != null) clearTimeout(statsTimer);
  statsTimer = setTimeout(run, 120);
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}
