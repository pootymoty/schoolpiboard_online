import type { ItemData, Point } from './protocol';

/**
 * Таблица на доске.
 *
 * Отдельного объекта на ячейку нет намеренно: тогда таблица распадалась
 * бы при перетаскивании, а выделить её целиком было бы нечем. Здесь это
 * один объект с габаритами и плоским списком ячеек по строкам — так же,
 * как штрих хранит плоский список точек.
 */

export const MAX_ROWS = 20;
export const MAX_COLS = 12;

export const DEFAULT_ROWS = 3;
export const DEFAULT_COLS = 3;

/** Минимальная ячейка в мировых единицах — ниже в неё не попасть пальцем. */
const MIN_CELL = 24;

export function clampRows(value: number): number {
  return Math.max(1, Math.min(MAX_ROWS, Math.round(value)));
}

export function clampCols(value: number): number {
  return Math.max(1, Math.min(MAX_COLS, Math.round(value)));
}

export interface TableBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rows: number;
  cols: number;
}

/** Габариты и размерность таблицы — то, из чего считается всё остальное. */
export function tableBox(data: ItemData): TableBox {
  const x1 = data.x1 ?? 0;
  const y1 = data.y1 ?? 0;
  const x2 = data.x2 ?? x1;
  const y2 = data.y2 ?? y1;

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(MIN_CELL, Math.abs(x2 - x1)),
    height: Math.max(MIN_CELL, Math.abs(y2 - y1)),
    rows: clampRows(data.rows ?? DEFAULT_ROWS),
    cols: clampCols(data.cols ?? DEFAULT_COLS),
  };
}

/** Прямоугольник ячейки в мировых координатах. */
export function cellRect(box: TableBox, row: number, col: number): {
  x: number; y: number; width: number; height: number;
} {
  const width = box.width / box.cols;
  const height = box.height / box.rows;

  return { x: box.x + col * width, y: box.y + row * height, width, height };
}

/** В какую ячейку ткнули. Вне таблицы — ничего. */
export function cellAt(data: ItemData, point: Point): { row: number; col: number } | null {
  const box = tableBox(data);

  if (point.x < box.x || point.x > box.x + box.width) return null;
  if (point.y < box.y || point.y > box.y + box.height) return null;

  const col = Math.min(box.cols - 1, Math.floor((point.x - box.x) / (box.width / box.cols)));
  const row = Math.min(box.rows - 1, Math.floor((point.y - box.y) / (box.height / box.rows)));

  return { row, col };
}

export function cellText(data: ItemData, row: number, col: number): string {
  const box = tableBox(data);
  return data.cells?.[row * box.cols + col] ?? '';
}

/** Таблица с изменённой ячейкой. Список ячеек дополняется до нужной длины. */
export function withCell(data: ItemData, row: number, col: number, text: string): ItemData {
  const box = tableBox(data);
  const cells = normalizeCells(data.cells, box.rows, box.cols);

  cells[row * box.cols + col] = text;

  return { ...data, rows: box.rows, cols: box.cols, cells };
}

/**
 * Список ячеек нужной длины. Недостающие добавляются пустыми, лишние
 * отбрасываются: размер таблицы меняют кнопками, и список должен идти
 * за ним, а не разъезжаться с ним.
 */
export function normalizeCells(cells: string[] | undefined, rows: number, cols: number): string[] {
  const result = new Array<string>(rows * cols).fill('');
  if (!cells) return result;

  for (let index = 0; index < Math.min(cells.length, result.length); index += 1) {
    result[index] = cells[index] ?? '';
  }

  return result;
}

/**
 * Таблица с другим числом строк и столбцов.
 *
 * Содержимое остаётся на своих местах по строке и столбцу, а не по
 * порядковому номеру: иначе добавление столбца сдвигало бы всё
 * написанное на одну ячейку и таблица перемешивалась.
 */
export function resized(data: ItemData, rows: number, cols: number): ItemData {
  const box = tableBox(data);
  const nextRows = clampRows(rows);
  const nextCols = clampCols(cols);

  const before = normalizeCells(data.cells, box.rows, box.cols);
  const after = new Array<string>(nextRows * nextCols).fill('');

  for (let row = 0; row < Math.min(box.rows, nextRows); row += 1) {
    for (let col = 0; col < Math.min(box.cols, nextCols); col += 1) {
      after[row * nextCols + col] = before[row * box.cols + col];
    }
  }

  return { ...data, rows: nextRows, cols: nextCols, cells: after };
}

/**
 * Сколько строк и столбцов уместить в нарисованную рамку.
 *
 * Таблицу строят протяжкой, и размер рамки — единственное, что человек
 * успел сообщить. Ячейку держим около сорока единиц: мельче в неё не
 * попасть пальцем, крупнее — таблица из двух клеток на пол-экрана.
 */
export function fitToBox(width: number, height: number): { rows: number; cols: number } {
  return {
    rows: clampRows(Math.max(1, Math.round(Math.abs(height) / 40))),
    cols: clampCols(Math.max(1, Math.round(Math.abs(width) / 80))),
  };
}
