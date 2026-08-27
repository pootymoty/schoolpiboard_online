import type { BoardRole } from '../api/types';

/** Точка штриха. `p` — нажим пера, 0..1; у мыши всегда 1. */
export interface Point {
  x: number;
  y: number;
  p: number;
}

export type ItemType = 'stroke' | 'rect' | 'ellipse' | 'line' | 'text' | 'image';

/** Оформление объекта. Одно на все типы: у фигур поля просто не заполнены. */
export interface ItemData {
  points?: Point[];
  /** Прямоугольник, эллипс, линия: два угла. */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color: string;
  width: number;
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
