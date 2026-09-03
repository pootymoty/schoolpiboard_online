import type { BoardRole } from '../api/types';

/** Точка штриха. `p` — нажим пера, 0..1; у мыши всегда 1. */
export interface Point {
  x: number;
  y: number;
  p: number;
}

/**
 * Тип объекта. Все фигуры — один тип с уточнением в `data.shape`: иначе
 * каждая новая фигура требовала бы менять и сервер, и базу.
 */
export type ItemType = 'stroke' | 'shape' | 'text' | 'image' | 'table';

export type ShapeKind =
  | 'line' | 'arrow' | 'rect' | 'ellipse'
  | 'triangle' | 'trapezoid' | 'parallelogram' | 'rhombus';

export type LineStyle = 'solid' | 'dash' | 'dashdot' | 'dot';

/** Оформление объекта. Одно на все типы: лишние поля просто не заполнены. */
export interface ItemData {
  /** Штрих: точки по ходу движения. */
  points?: Point[];

  /** Фигура и надпись: два угла габаритов. */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;

  shape?: ShapeKind;
  lineStyle?: LineStyle;

  text?: string;
  fontSize?: number;

  /**
   * Картинка: отношение ширины к высоте. По нему её тянут пропорционально —
   * растянутая отдельно по одной стороне страница документа читается плохо
   * и выглядит как ошибка.
   */
  ratio?: number;

  /** Таблица: размерность и содержимое ячеек по строкам, слева направо. */
  rows?: number;
  cols?: number;
  cells?: string[];

  color: string;
  width: number;
  /** 0..1. Маркер рисуется полупрозрачным. */
  opacity?: number;
}

export interface BoardItem {
  id: number;
  type: ItemType;
  z: number;
  data: ItemData;
  imageRef: string | null;
  lockedBy: string | null;
}

export interface Participant {
  connectionId: string;
  displayName: string;
  role: BoardRole;
  isGuest: boolean;
}

export interface Cursor {
  id: string;
  name: string;
  x: number;
  y: number;
}

export type GridStyle =
  | 'none' | 'line' | 'wide' | 'dot' | 'square'
  | 'graph' | 'hybrid' | 'rhombus' | 'triangle';

/** Оформление холста — свойство доски, общее для всех. */
export interface Background {
  background: string;
  gridStyle: GridStyle;
  gridColor: string;
}

export const DEFAULT_BACKGROUND: Background = {
  background: '#FFFDF8',
  gridStyle: 'none',
  gridColor: '#D9CFC0',
};

/** Начальное состояние доски. */
export interface JoinedPayload {
  role: BoardRole;
  canEdit: boolean;
  canManage: boolean;
  seq: number;
  items: BoardItem[];
  participants: Participant[];
  background: Background;
}

/** Возвращение после обрыва: доска уже нарисована, нужно только пропущенное. */
export interface ResumedPayload {
  role: BoardRole;
  canEdit: boolean;
  canManage: boolean;
  seq: number;
  participants: Participant[];
  events: { seq: number; name: string; payload: unknown }[];
}

/** Ответ на запрос состояния: заменяет местное представление целиком. */
export interface SyncedPayload {
  seq: number;
  items: BoardItem[];
  participants: Participant[];
  background: Background;
}

/** Чужой штрих, пока он ещё рисуется: в базе его нет, он живёт в памяти. */
export interface LiveStroke {
  tempId: string;
  by: string;
  type: ItemType;
  data: ItemData;
}
