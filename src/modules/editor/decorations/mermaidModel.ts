/** Mermaid 视图偏好：相对「适应画布」的缩放倍率 / 字号。 */

export interface MermaidViewPrefs {
  /**
   * 相对适应态的倍率。1 = 完整铺满画布宽度；>1 在画布内放大（可裁切）。
   */
  zoom: number;
  fontSize: number;
}

export const DEFAULT_MERMAID_PREFS: MermaidViewPrefs = {
  zoom: 1,
  fontSize: 16,
};

export function normalizeMermaidPrefs(prefs: Partial<MermaidViewPrefs> | null | undefined): MermaidViewPrefs {
  const record = prefs as (Partial<MermaidViewPrefs> & { scale?: number }) | null | undefined;
  const hasZoom = record?.zoom != null && Number.isFinite(Number(record.zoom));
  // 旧版把 CSS 绝对 scale 写入注释；不能当相对 zoom 用，否则首次打开会缩成芝麻粒
  const zoom = hasZoom ? Number(record!.zoom) : 1;
  const fontSize = Number(record?.fontSize);
  return {
    zoom: Number.isFinite(zoom) ? Math.min(5, Math.max(0.5, Math.round(zoom * 100) / 100)) : 1,
    fontSize: Number.isFinite(fontSize) ? Math.min(28, Math.max(10, Math.round(fontSize))) : 16,
  };
}

export function parseMermaidMetaLine(text: string): MermaidViewPrefs | null {
  const m = text.trim().match(/^<!--\s*markmfy-mermaid:\s*(\{[\s\S]*?\})\s*-->$/);
  if (!m?.[1]) return null;
  try {
    const raw = JSON.parse(m[1]) as Partial<MermaidViewPrefs> & { scale?: number };
    // 只有新字段 zoom 才采纳；仅有旧 scale 时回到适应态
    if (raw.zoom == null && raw.scale != null) {
      return normalizeMermaidPrefs({ fontSize: raw.fontSize, zoom: 1 });
    }
    return normalizeMermaidPrefs(raw);
  } catch {
    return null;
  }
}

export function serializeMermaidMeta(prefs: MermaidViewPrefs): string {
  const normalized = normalizeMermaidPrefs(prefs);
  if (normalized.zoom === 1 && normalized.fontSize === 16) return "";
  return `<!-- markmfy-mermaid: ${JSON.stringify({ zoom: normalized.zoom, fontSize: normalized.fontSize })} -->\n`;
}

export function prefsEqual(a: MermaidViewPrefs, b: MermaidViewPrefs): boolean {
  return a.zoom === b.zoom && a.fontSize === b.fontSize;
}
