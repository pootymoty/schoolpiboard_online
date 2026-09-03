import type { ItemData, ItemType } from './protocol';

/**
 * Буфер объектов доски.
 *
 * Лежит в хранилище браузера, а не в памяти страницы: копировать нужно
 * между досками, а переход на другую доску — это перезагрузка страницы.
 * По той же причине копия видна и в соседней вкладке.
 *
 * Свой буфер, а не системный: в системный кладут текст и картинки, и
 * класть туда же наши объекты значило бы затирать то, что человек
 * скопировал в другом месте.
 */
const KEY = 'schoolpi.board.clipboard';

export interface ClipItem {
  type: ItemType;
  data: ItemData;
  imageRef: string | null;
}

export interface Clip {
  /** Откуда скопировано: картинки принадлежат своей доске. */
  boardId: number;
  items: ClipItem[];
}

export function writeClip(clip: Clip): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clip));
  } catch {
    // Приватный режим или переполненное хранилище: копирование просто
    // не сработает, ронять из-за этого доску незачем.
  }
}

export function readClip(): Clip | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const clip = JSON.parse(raw) as Clip;
    return Array.isArray(clip.items) && clip.items.length > 0 ? clip : null;
  } catch {
    return null;
  }
}

export function clearClip(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // См. выше.
  }
}
