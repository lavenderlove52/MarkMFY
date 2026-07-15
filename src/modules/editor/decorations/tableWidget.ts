import { EditorView, WidgetType } from "@codemirror/view";
import { appendInlineMarkdown, createToolbarButton } from "./widgetDom";
import {
  deleteColumn,
  deleteRow,
  emptyLayout,
  insertColumn,
  insertRow,
  layoutDeleteColumn,
  layoutDeleteRow,
  layoutHasCustomSize,
  layoutInsertColumn,
  layoutInsertRow,
  normalizeLayout,
  normalizeTableRows,
  serializeTable,
  updateCell,
  type TableLayout,
} from "./tableModel";
import { requestTableSourceEdit } from "./tableSourceEdit";

export interface TableCellData {
  text: string;
  isHeader: boolean;
}

/** 文档更新后把焦点还回指定单元格，避免 remount 丢焦点。 */
let pendingTableFocus: { tableFrom: number; row: number; col: number } | null = null;

function applyTableText(
  view: EditorView,
  from: number,
  to: number,
  rows: string[][],
  layout: TableLayout | null,
  focus?: { row: number; col: number },
): void {
  let insert = serializeTable(rows, layout);
  const original = view.state.doc.sliceString(from, to);
  const originalEndsWithNl = original.endsWith("\n");
  if (originalEndsWithNl && !insert.endsWith("\n")) insert += "\n";
  if (!originalEndsWithNl && insert.endsWith("\n")) insert = insert.slice(0, -1);

  if (focus) {
    pendingTableFocus = { tableFrom: from, row: focus.row, col: focus.col };
  }

  view.dispatch({
    changes: { from, to, insert },
  });
}

function makeControlButton(label: string, title: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function placeButton(btn: HTMLElement, overlay: HTMLElement, centerX: number, centerY: number): void {
  btn.style.left = `${Math.round(centerX - 8)}px`;
  btn.style.top = `${Math.round(centerY - 8)}px`;
  overlay.appendChild(btn);
}

function measureCurrentLayout(table: HTMLTableElement, rowCount: number, colCount: number): TableLayout {
  const layout = emptyLayout(rowCount, colCount);
  const headerCells = table.querySelectorAll<HTMLElement>('tr[data-mm-table-row="0"] .mm-table-cell');
  headerCells.forEach((cell, i) => {
    if (i < colCount) layout.cols[i] = Math.max(40, Math.round(cell.getBoundingClientRect().width));
  });
  const rows = table.querySelectorAll<HTMLTableRowElement>("tr[data-mm-table-row]");
  rows.forEach((tr, i) => {
    if (i < rowCount) layout.rows[i] = Math.max(24, Math.round(tr.getBoundingClientRect().height));
  });
  return layout;
}

/**
 * MarkText 风格可交互表格：
 * - 单元格直接编辑
 * - 悬浮增删行列
 * - 拖拽调整列宽 / 行高（持久化为表格后 HTML 注释）
 */
export class TableWidget extends WidgetType {
  private readonly cells: string[][];
  private readonly layout: TableLayout;

  constructor(
    rows: TableCellData[][],
    readonly from: number,
    readonly to: number,
    layout: TableLayout | null = null,
  ) {
    super();
    this.cells = normalizeTableRows(rows.map((r) => r.map((c) => c.text)));
    this.layout = normalizeLayout(layout, this.cells);
  }

  eq(other: TableWidget): boolean {
    return (
      other.from === this.from &&
      other.to === this.to &&
      JSON.stringify(other.cells) === JSON.stringify(this.cells) &&
      JSON.stringify(other.layout) === JSON.stringify(this.layout)
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mm-table-wrap";
    wrap.setAttribute("contenteditable", "false");

    let workingLayout = { cols: [...this.layout.cols], rows: [...this.layout.rows] };

    const persist = (rows: string[][], layout: TableLayout, focus?: { row: number; col: number }): void => {
      workingLayout = normalizeLayout(layout, rows);
      applyTableText(view, this.from, this.to, rows, workingLayout, focus);
    };

    const toolbar = document.createElement("div");
    toolbar.className = "mm-widget-toolbar";
    toolbar.append(
      createToolbarButton("+行", () => {
        const nextRows = insertRow(this.cells, this.cells.length);
        persist(nextRows, layoutInsertRow(workingLayout, nextRows.length), {
          row: nextRows.length - 1,
          col: 0,
        });
      }),
      createToolbarButton("+列", () => {
        const cols = this.cells[0]?.length ?? 0;
        const nextRows = insertColumn(this.cells, cols);
        persist(nextRows, layoutInsertColumn(workingLayout, cols), { row: 0, col: cols });
      }),
      createToolbarButton("源码编辑", () => {
        view.dispatch({
          effects: requestTableSourceEdit.of({ from: this.from, to: this.to }),
          selection: {
            anchor: this.from < this.to ? Math.min(this.from + 1, this.to - 1) : this.from,
          },
          scrollIntoView: true,
        });
        view.focus();
      }),
    );

    const frame = document.createElement("div");
    frame.className = "mm-table-frame";

    const table = document.createElement("table");
    table.className = "mm-table";
    if (layoutHasCustomSize(workingLayout)) {
      table.classList.add("mm-table--fixed");
    }

    const colgroup = document.createElement("colgroup");
    const colCount = this.cells[0]?.length ?? 0;
    const rowCount = this.cells.length;
    const colEls: HTMLTableColElement[] = [];
    for (let c = 0; c < colCount; c++) {
      const col = document.createElement("col");
      if (workingLayout.cols[c] > 0) col.style.width = `${workingLayout.cols[c]}px`;
      colgroup.appendChild(col);
      colEls.push(col);
    }
    table.appendChild(colgroup);

    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    this.cells.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      tr.dataset.mmTableRow = String(rowIndex);
      if (workingLayout.rows[rowIndex] > 0) {
        tr.style.height = `${workingLayout.rows[rowIndex]}px`;
      }

      row.forEach((cellText, colIndex) => {
        const el = document.createElement(rowIndex === 0 ? "th" : "td");
        el.className = "mm-table-cell";
        el.dataset.mmRow = String(rowIndex);
        el.dataset.mmCol = String(colIndex);
        el.setAttribute("tabindex", "0");

        const content = document.createElement("div");
        content.className = "mm-table-cell__content";

        const paintDisplay = (): void => {
          content.replaceChildren();
          el.classList.remove("mm-table-cell--editing");
          content.contentEditable = "false";
          if (cellText) appendInlineMarkdown(content, cellText);
        };

        const enterEdit = (): void => {
          if (el.classList.contains("mm-table-cell--editing")) return;
          el.classList.add("mm-table-cell--editing");
          content.contentEditable = "true";
          content.replaceChildren();
          content.textContent = cellText;
          const range = document.createRange();
          range.selectNodeContents(content);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          content.focus();
        };

        const readEditText = (): string => (content.textContent ?? "").replace(/\r?\n/g, " ").trim();

        const commit = (): void => {
          if (!el.classList.contains("mm-table-cell--editing")) return;
          const nextText = readEditText();
          content.contentEditable = "false";
          if (nextText === cellText) {
            paintDisplay();
            return;
          }
          persist(updateCell(this.cells, rowIndex, colIndex, nextText), workingLayout, {
            row: rowIndex,
            col: colIndex,
          });
        };

        paintDisplay();
        el.appendChild(content);

        el.addEventListener("mousedown", (e) => {
          if ((e.target as HTMLElement).closest(".mm-table-resizer")) return;
          e.stopPropagation();
        });
        el.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".mm-table-resizer")) return;
          e.preventDefault();
          e.stopPropagation();
          enterEdit();
        });
        content.addEventListener("keydown", (e) => {
          if (!el.classList.contains("mm-table-cell--editing")) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            content.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            paintDisplay();
          } else if (e.key === "Tab") {
            e.preventDefault();
            const nextText = readEditText();
            let nextRows = this.cells;
            let nextLayout = workingLayout;
            if (nextText !== cellText) {
              nextRows = updateCell(nextRows, rowIndex, colIndex, nextText);
            }

            let nr = rowIndex;
            let nc = e.shiftKey ? colIndex - 1 : colIndex + 1;
            if (nc >= colCount) {
              nr += 1;
              nc = 0;
            } else if (nc < 0) {
              nr -= 1;
              nc = colCount - 1;
            }

            if (nr >= rowCount && !e.shiftKey) {
              nextRows = insertRow(nextRows, nextRows.length);
              nextLayout = layoutInsertRow(nextLayout, nextRows.length);
              persist(nextRows, nextLayout, { row: nextRows.length - 1, col: 0 });
            } else if (nr >= 0 && nr < (nextRows === this.cells ? rowCount : nextRows.length)) {
              if (nextText !== cellText) {
                persist(nextRows, nextLayout, { row: nr, col: nc });
              } else {
                paintDisplay();
                requestAnimationFrame(() => {
                  (
                    wrap.querySelector(`[data-mm-row="${nr}"][data-mm-col="${nc}"]`) as HTMLElement | null
                  )?.click();
                });
              }
            }
          }
          e.stopPropagation();
        });
        content.addEventListener("blur", () => {
          window.setTimeout(() => {
            if (document.activeElement && wrap.contains(document.activeElement)) return;
            commit();
          }, 0);
        });

        // 列右缘拖拽改宽
        if (rowIndex === 0) {
          const colResizer = document.createElement("div");
          colResizer.className = "mm-table-resizer mm-table-resizer--col";
          colResizer.title = "拖拽调整列宽";
          colResizer.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            table.classList.add("mm-table--fixed");
            const startX = e.clientX;
            const measured = measureCurrentLayout(table, rowCount, colCount);
            workingLayout = measured;
            const startW = measured.cols[colIndex] || 80;

            const onMove = (ev: MouseEvent): void => {
              const nextW = Math.max(40, Math.round(startW + (ev.clientX - startX)));
              workingLayout.cols[colIndex] = nextW;
              colEls[colIndex].style.width = `${nextW}px`;
            };
            const onUp = (): void => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              document.body.classList.remove("mm-table-resizing", "mm-table-resizing-row");
              persist(this.cells, workingLayout);
            };
            document.body.classList.add("mm-table-resizing");
            document.body.classList.remove("mm-table-resizing-row");
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          });
          el.appendChild(colResizer);
        }

        // 行底边拖拽改高（每行最后一个单元格放手柄，避免重复）
        if (colIndex === colCount - 1) {
          const rowResizer = document.createElement("div");
          rowResizer.className = "mm-table-resizer mm-table-resizer--row";
          rowResizer.title = "拖拽调整行高";
          rowResizer.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const startY = e.clientY;
            const measured = measureCurrentLayout(table, rowCount, colCount);
            workingLayout = measured;
            const startH = measured.rows[rowIndex] || 32;

            const onMove = (ev: MouseEvent): void => {
              const nextH = Math.max(24, Math.round(startH + (ev.clientY - startY)));
              workingLayout.rows[rowIndex] = nextH;
              tr.style.height = `${nextH}px`;
            };
            const onUp = (): void => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              document.body.classList.remove("mm-table-resizing", "mm-table-resizing-row");
              persist(this.cells, workingLayout);
            };
            document.body.classList.add("mm-table-resizing", "mm-table-resizing-row");
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          });
          el.appendChild(rowResizer);
        }

        tr.appendChild(el);
      });

      if (rowIndex === 0) thead.appendChild(tr);
      else tbody.appendChild(tr);
    });

    table.appendChild(thead);
    if (tbody.childNodes.length > 0) table.appendChild(tbody);

    const overlay = document.createElement("div");
    overlay.className = "mm-table-overlay";

    const syncHandles = (): void => {
      overlay.replaceChildren();
      const frameRect = frame.getBoundingClientRect();
      if (frameRect.width === 0) return;

      const rowEls = table.querySelectorAll<HTMLTableRowElement>("tr[data-mm-table-row]");
      rowEls.forEach((tr, rowIndex) => {
        const rect = tr.getBoundingClientRect();
        const midY = rect.top - frameRect.top + rect.height / 2;
        const leftX = -7;

        if (rowIndex > 0) {
          placeButton(
            makeControlButton("×", "删除本行", "mm-table-handle mm-table-del", () => {
              persist(
                deleteRow(this.cells, rowIndex),
                layoutDeleteRow(workingLayout, rowIndex),
                { row: Math.min(rowIndex, rowCount - 2), col: 0 },
              );
            }),
            overlay,
            leftX,
            midY - 8,
          );
        }

        placeButton(
          makeControlButton("+", "在下方插入行", "mm-table-handle mm-table-add", () => {
            persist(
              insertRow(this.cells, rowIndex + 1),
              layoutInsertRow(workingLayout, rowIndex + 1),
              { row: rowIndex + 1, col: 0 },
            );
          }),
          overlay,
          leftX,
          midY + (rowIndex > 0 ? 8 : 0),
        );
      });

      const headerCells = table.querySelectorAll<HTMLElement>('tr[data-mm-table-row="0"] .mm-table-cell');
      headerCells.forEach((cell, colIndex) => {
        const rect = cell.getBoundingClientRect();
        const midX = rect.left - frameRect.left + rect.width / 2;
        const topY = rect.top - frameRect.top - 2;

        placeButton(
          makeControlButton("×", "删除本列", "mm-table-handle mm-table-del", () => {
            if (colCount <= 1) return;
            persist(deleteColumn(this.cells, colIndex), layoutDeleteColumn(workingLayout, colIndex), {
              row: 0,
              col: Math.max(0, colIndex - 1),
            });
          }),
          overlay,
          midX - 8,
          topY,
        );
        placeButton(
          makeControlButton("+", "在右侧插入列", "mm-table-handle mm-table-add", () => {
            persist(insertColumn(this.cells, colIndex + 1), layoutInsertColumn(workingLayout, colIndex + 1), {
              row: 0,
              col: colIndex + 1,
            });
          }),
          overlay,
          midX + 8,
          topY,
        );
      });

      if (headerCells[0]) {
        const rect = headerCells[0].getBoundingClientRect();
        placeButton(
          makeControlButton("+", "在最左侧插入列", "mm-table-handle mm-table-add", () => {
            persist(insertColumn(this.cells, 0), layoutInsertColumn(workingLayout, 0), { row: 0, col: 0 });
          }),
          overlay,
          rect.left - frameRect.left - 2,
          rect.top - frameRect.top - 2,
        );
      }
    };

    frame.append(table, overlay);
    wrap.append(toolbar, frame);

    requestAnimationFrame(syncHandles);
    wrap.addEventListener("mouseenter", () => requestAnimationFrame(syncHandles));

    if (pendingTableFocus && pendingTableFocus.tableFrom === this.from) {
      const { row, col } = pendingTableFocus;
      pendingTableFocus = null;
      requestAnimationFrame(() => {
        (
          wrap.querySelector(`[data-mm-row="${row}"][data-mm-col="${col}"]`) as HTMLElement | null
        )?.click();
      });
    }

    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
