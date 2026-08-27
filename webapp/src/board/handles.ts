import type { BoardItem, ItemData } from './protocol';
import type { Bounds } from './geometry';

/**
 * Ручки трансформации.
 *
 * Показываются не у всего: у фигуры и надписи это восемь ручек по
 * габаритам, у линии и стрелки — две на концах (тащат один конец,
 * второй стоит), а у рукописного штриха ручек нет вовсе. Растягивать
 * начерченное от руки за угол — значит искажать почерк, и в десктопной
 * версии этого намеренно нет.
 */
export type HandleId =
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  | 'p1' | 'p2';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
  cursor: string;
}

/** Сколько экранных пикселей занимает ручка. */
export const HANDLE_SIZE = 9;

export function handlesFor(item: BoardItem, box: Bounds): Handle[] {
  if (item.type === 'stroke') return [];

  if (item.data.shape === 'line' || item.data.shape === 'arrow') {
    return [
      { id: 'p1', x: item.data.x1 ?? 0, y: item.data.y1 ?? 0, cursor: 'move' },
      { id: 'p2', x: item.data.x2 ?? 0, y: item.data.y2 ?? 0, cursor: 'move' },
    ];
  }

  const { x, y, width, height } = box;
  const midX = x + width / 2;
  const midY = y + height / 2;

  return [
    { id: 'nw', x, y, cursor: 'nwse-resize' },
    { id: 'n', x: midX, y, cursor: 'ns-resize' },
    { id: 'ne', x: x + width, y, cursor: 'nesw-resize' },
    { id: 'e', x: x + width, y: midY, cursor: 'ew-resize' },
    { id: 'se', x: x + width, y: y + height, cursor: 'nwse-resize' },
    { id: 's', x: midX, y: y + height, cursor: 'ns-resize' },
    { id: 'sw', x, y: y + height, cursor: 'nesw-resize' },
    { id: 'w', x, y: midY, cursor: 'ew-resize' },
  ];
}

/**
 * Новая геометрия объекта после протаскивания ручки.
 *
 * Считается от исходных габаритов, а не от текущих: иначе округление на
 * каждом кадре накапливалось бы, и фигура «уползала» бы за указателем.
 */
export function resized(
  data: ItemData,
  origin: Bounds,
  handle: HandleId,
  dx: number,
  dy: number,
): ItemData {
  if (handle === 'p1') return { ...data, x1: (data.x1 ?? 0) + dx, y1: (data.y1 ?? 0) + dy };
  if (handle === 'p2') return { ...data, x2: (data.x2 ?? 0) + dx, y2: (data.y2 ?? 0) + dy };

  const left = origin.x + (handle.includes('w') ? dx : 0);
  const right = origin.x + origin.width + (handle.includes('e') ? dx : 0);
  const top = origin.y + (handle.startsWith('n') ? dy : 0);
  const bottom = origin.y + origin.height + (handle.startsWith('s') ? dy : 0);

  // Схлопывать в ноль нельзя: из нулевых габаритов фигуру уже не вытянуть
  // обратно — ухватиться будет не за что.
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  if (data.text !== undefined) {
    // Надпись тянется вместе со шрифтом: растянуть рамку, оставив буквы
    // прежними, значит нарисовать рамку, а не изменить надпись.
    const factor = origin.height > 0 ? height / origin.height : 1;

    return {
      ...data,
      x1: left,
      y1: top,
      x2: left + width,
      y2: top + height,
      fontSize: Math.max(6, (data.fontSize ?? 24) * factor),
    };
  }

  return { ...data, x1: left, y1: top, x2: left + width, y2: top + height };
}
