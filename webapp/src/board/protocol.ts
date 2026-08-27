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
export type ItemType = 'stroke' | 'shape' | 'text' | 'image';

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

/** Начальное состояние доски. */
export interface JoinedPayload {
  role: BoardRole;
  canEdit: boolean;
  canManage: boolean;
  seq: number;
  items: BoardItem[];
  participants: Participant[];
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
}

/** Чужой штрих, пока он ещё рисуется: в базе его нет, он живёт в памяти. */
export interface LiveStroke {
  tempId: string;
  by: string;
  type: ItemType;
  data: ItemData;
}
