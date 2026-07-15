/** GFM 表格数据模型：序列化、增删行列、宽高布局（HTML 注释持久化）。 */

export function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function normalizeTableRows(rows: string[][]): string[][] {
  if (rows.length === 0) return [["", ""]];
  const colCount = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((row) => {
    const next = row.map((c) => c ?? "");
    while (next.length < colCount) next.push("");
    return next.slice(0, colCount);
  });
}

/** 列宽 / 行高（px）；0 表示跟随内容自适应。 */
export interface TableLayout {
  cols: number[];
  rows: number[];
}

export function emptyLayout(rowCount: number, colCount: number): TableLayout {
  return {
    cols: Array.from({ length: colCount }, () => 0),
    rows: Array.from({ length: rowCount }, () => 0),
  };
}

export function normalizeLayout(layout: TableLayout | null | undefined, rows: string[][]): TableLayout {
  const normalized = normalizeTableRows(rows);
  const colCount = normalized[0]?.length ?? 1;
  const rowCount = normalized.length;
  const cols = Array.from({ length: colCount }, (_, i) => {
    const w = layout?.cols[i];
    return typeof w === "number" && Number.isFinite(w) && w >= 40 ? Math.round(w) : 0;
  });
  const rowHeights = Array.from({ length: rowCount }, (_, i) => {
    const h = layout?.rows[i];
    return typeof h === "number" && Number.isFinite(h) && h >= 24 ? Math.round(h) : 0;
  });
  return { cols, rows: rowHeights };
}

export function layoutHasCustomSize(layout: TableLayout): boolean {
  return layout.cols.some((c) => c > 0) || layout.rows.some((r) => r > 0);
}

export function parseTableMetaLine(text: string): TableLayout | null {
  const m = text.trim().match(/^<!--\s*markmfy-table:\s*(\{[\s\S]*?\})\s*-->$/);
  if (!m?.[1]) return null;
  try {
    const data = JSON.parse(m[1]) as Partial<TableLayout>;
    const cols = Array.isArray(data.cols) ? data.cols.map((n) => Number(n) || 0) : [];
    const rows = Array.isArray(data.rows) ? data.rows.map((n) => Number(n) || 0) : [];
    return { cols, rows };
  } catch {
    return null;
  }
}

export function serializeTableMeta(layout: TableLayout): string {
  return `<!-- markmfy-table: ${JSON.stringify({ cols: layout.cols, rows: layout.rows })} -->\n`;
}

/** 序列化为 GFM 表格文本；有自定义宽高时追加 HTML 注释行。 */
export function serializeTable(rows: string[][], layout?: TableLayout | null): string {
  const normalized = normalizeTableRows(rows);
  const header = normalized[0] ?? ["", ""];
  const separator = header.map(() => "---");
  const lines = [
    `| ${header.map(escapeTableCell).join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
  ];
  let out = `${lines.join("\n")}\n`;
  const normalizedLayout = normalizeLayout(layout, normalized);
  if (layoutHasCustomSize(normalizedLayout)) {
    out += serializeTableMeta(normalizedLayout);
  }
  return out;
}

export function insertRow(rows: string[][], atIndex: number): string[][] {
  const normalized = normalizeTableRows(rows);
  const cols = normalized[0]?.length ?? 1;
  const empty = Array.from({ length: cols }, () => "");
  const next = normalized.map((r) => [...r]);
  const index = Math.max(0, Math.min(atIndex, next.length));
  const clamped = Math.max(1, index);
  next.splice(clamped, 0, empty);
  return next;
}

export function insertColumn(rows: string[][], atIndex: number): string[][] {
  const normalized = normalizeTableRows(rows);
  const index = Math.max(0, Math.min(atIndex, normalized[0]?.length ?? 0));
  return normalized.map((row) => {
    const next = [...row];
    next.splice(index, 0, "");
    return next;
  });
}

export function deleteRow(rows: string[][], rowIndex: number): string[][] {
  const normalized = normalizeTableRows(rows);
  if (rowIndex <= 0) return normalized;
  if (normalized.length <= 1) return normalized;
  return normalized.filter((_, i) => i !== rowIndex);
}

export function deleteColumn(rows: string[][], colIndex: number): string[][] {
  const normalized = normalizeTableRows(rows);
  const cols = normalized[0]?.length ?? 0;
  if (cols <= 1) return normalized;
  if (colIndex < 0 || colIndex >= cols) return normalized;
  return normalized.map((row) => row.filter((_, i) => i !== colIndex));
}

export function updateCell(rows: string[][], rowIndex: number, colIndex: number, text: string): string[][] {
  const normalized = normalizeTableRows(rows);
  if (!normalized[rowIndex] || colIndex < 0 || colIndex >= normalized[rowIndex].length) {
    return normalized;
  }
  const next = normalized.map((r) => [...r]);
  next[rowIndex][colIndex] = text;
  return next;
}

export function layoutInsertColumn(layout: TableLayout, atIndex: number, width = 120): TableLayout {
  const cols = [...layout.cols];
  const index = Math.max(0, Math.min(atIndex, cols.length));
  cols.splice(index, 0, width);
  return { cols, rows: [...layout.rows] };
}

export function layoutDeleteColumn(layout: TableLayout, colIndex: number): TableLayout {
  if (layout.cols.length <= 1) return layout;
  return {
    cols: layout.cols.filter((_, i) => i !== colIndex),
    rows: [...layout.rows],
  };
}

export function layoutInsertRow(layout: TableLayout, atIndex: number, height = 36): TableLayout {
  const rows = [...layout.rows];
  const index = Math.max(1, Math.min(atIndex, rows.length));
  rows.splice(index, 0, height);
  return { cols: [...layout.cols], rows };
}

export function layoutDeleteRow(layout: TableLayout, rowIndex: number): TableLayout {
  if (rowIndex <= 0 || layout.rows.length <= 1) return layout;
  return {
    cols: [...layout.cols],
    rows: layout.rows.filter((_, i) => i !== rowIndex),
  };
}
