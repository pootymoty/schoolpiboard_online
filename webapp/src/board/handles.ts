import type { BoardItem, ItemData } from './protocol';
import type { Bounds } from './geometry';
import { boxOf, centerOf, radians, rotatePoint } from './rotate';

/** Габариты надписи в её же шрифте — по ним строится рамка. */
export function measureText(text: string, fontSize: number): { width: number; height: number } {
  const context = document.createElement('canvas').getContext('2d');
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.25;

  if (!context) return { width: fontSize * lines[0].length * 0.6, height: lines.length * lineHeight };

  context.font = `${fontSize}px Manrope, system-ui, sans-serif`;

  return {
    width: Math.max(...lines.map((line) => context.measureText(line).width), 1),
    height: lines.length * lineHeight,
  };
}

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
  | 'p1' | 'p2'
  /** Ручка поворота — над верхней серединой, на отлёте. */
  | 'rot';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
  cursor: string;
}

/** Сколько экранных пикселей занимает ручка. */
export const HANDLE_SIZE = 9;

/** Насколько ручка поворота отстоит от верхнего края, в мировых единицах. */
const ROTATE_REACH = 28;

export function handlesFor(item: BoardItem, box: Bounds): Handle[] {
  if (item.type === 'stroke') return [];

  if (item.data.shape === 'line' || item.data.shape === 'arrow') {
    return [
      { id: 'p1', x: item.data.x1 ?? 0, y: item.data.y1 ?? 0, cursor: 'move' },
      { id: 'p2', x: item.data.x2 ?? 0, y: item.data.y2 ?? 0, cursor: 'move' },
    ];
  }

  // Ручки стоят по неповёрнутым габаритам и потом поворачиваются вместе
  // с объектом: по прямоугольнику габаритов повёрнутой фигуры они
  // оказались бы в стороне от её углов.
  const local = boxOf(item.data) ?? box;

  const { x, y, width, height } = local;
  const midX = x + width / 2;
  const midY = y + height / 2;

  const handles: Handle[] = [
    { id: 'nw', x, y, cursor: 'nwse-resize' },
    { id: 'n', x: midX, y, cursor: 'ns-resize' },
    { id: 'ne', x: x + width, y, cursor: 'nesw-resize' },
    { id: 'e', x: x + width, y: midY, cursor: 'ew-resize' },
    { id: 'se', x: x + width, y: y + height, cursor: 'nwse-resize' },
    { id: 's', x: midX, y: y + height, cursor: 'ns-resize' },
    { id: 'sw', x, y: y + height, cursor: 'nesw-resize' },
    { id: 'w', x, y: midY, cursor: 'ew-resize' },
    { id: 'rot', x: midX, y: y - ROTATE_REACH, cursor: 'grab' },
  ];

  const angle = item.data.angle ?? 0;
  if (!angle) return handles;

  const center = centerOf(item.data);
  if (!center) return handles;

  return handles.map((handle) => {
    const moved = rotatePoint({ x: handle.x, y: handle.y, p: 1 }, center, angle);
    return { ...handle, x: moved.x, y: moved.y };
  });
}

/** Угол от центра объекта до точки — по нему и вертят. */
export function angleTo(center: { x: number; y: number }, point: { x: number; y: number }): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
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

  const spin = data.angle ?? 0;

  if (spin) {
    // Сдвиг указателя переводим в собственные оси объекта: тянут за его
    // правый край, а он повёрнут — значит «вправо» для него означает
    // другое направление на экране.
    const back = radians(-spin);
    const localDx = dx * Math.cos(back) - dy * Math.sin(back);
    const localDy = dx * Math.sin(back) + dy * Math.cos(back);

    const next = resized({ ...data, angle: 0 }, origin, handle, localDx, localDy);

    // Середина габаритов сместилась, а вертится объект вокруг неё —
    // значит, неподвижный угол уехал бы. Возвращаем его на место.
    const before = anchorOf(origin, handle);
    const after = anchorOf(boxOf(next) ?? origin, handle);

    const was = rotatePoint(
      { ...before, p: 1 },
      { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2, p: 1 },
      spin,
    );

    const now = rotatePoint(
      { ...after, p: 1 },
      { x: (boxOf(next)?.x ?? 0) + (boxOf(next)?.width ?? 0) / 2,
        y: (boxOf(next)?.y ?? 0) + (boxOf(next)?.height ?? 0) / 2, p: 1 },
      spin,
    );

    const shiftX = was.x - now.x;
    const shiftY = was.y - now.y;

    return {
      ...next,
      angle: spin,
      x1: (next.x1 ?? 0) + shiftX,
      y1: (next.y1 ?? 0) + shiftY,
      x2: (next.x2 ?? 0) + shiftX,
      y2: (next.y2 ?? 0) + shiftY,
    };
  }

  const left = origin.x + (handle.includes('w') ? dx : 0);
  const right = origin.x + origin.width + (handle.includes('e') ? dx : 0);
  const top = origin.y + (handle.startsWith('n') ? dy : 0);
  const bottom = origin.y + origin.height + (handle.startsWith('s') ? dy : 0);

  // Схлопывать в ноль нельзя: из нулевых габаритов фигуру уже не вытянуть
  // обратно — ухватиться будет не за что.
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  // Картинка тянется пропорционально: страница документа, растянутая по
  // одной стороне, читается плохо и выглядит как поломка.
  if (data.ratio !== undefined && data.ratio > 0) {
    const byWidth = origin.width > 0 ? width / origin.width : 1;
    const byHeight = origin.height > 0 ? height / origin.height : 1;

    const horizontal = handle === 'e' || handle === 'w';
    const vertical = handle === 'n' || handle === 's';

    const factor = horizontal ? byWidth : vertical ? byHeight : Math.max(byWidth, byHeight);

    const nextWidth = Math.max(8, origin.width * factor);
    const nextHeight = nextWidth / data.ratio;

    // Тянут за левый или верхний край — двигается он, а противоположный
    // остаётся на месте: иначе картинка уезжала бы из-под пальца.
    const x = handle.includes('w') ? origin.x + origin.width - nextWidth : origin.x;
    const y = handle.startsWith('n') ? origin.y + origin.height - nextHeight : origin.y;

    return { ...data, x1: x, y1: y, x2: x + nextWidth, y2: y + nextHeight };
  }

  if (data.text !== undefined) {
    // Надпись меняется целиком и пропорционально: у букв есть своё
    // соотношение сторон, и растянуть рамку отдельно от них — значит
    // получить рамку, которая надписи не соответствует.
    //
    // Коэффициент берём по той стороне, которую тянули: за угол — по
    // большей из двух, за середину стороны — по ней одной.
    const byWidth = origin.width > 0 ? width / origin.width : 1;
    const byHeight = origin.height > 0 ? height / origin.height : 1;

    const horizontal = handle === 'e' || handle === 'w';
    const vertical = handle === 'n' || handle === 's';

    const factor = horizontal ? byWidth : vertical ? byHeight : Math.max(byWidth, byHeight);
    const fontSize = Math.max(6, (data.fontSize ?? 24) * factor);

    const box = measureText(data.text ?? '', fontSize);

    // Рамку пересчитываем по новым буквам, а не по тому, куда уехал
    // палец: иначе она разошлась бы с надписью с первого же движения.
    return {
      ...data,
      x1: handle.includes('w') ? origin.x + origin.width - box.width : left,
      y1: handle.startsWith('n') ? origin.y + origin.height - box.height : top,
      x2: (handle.includes('w') ? origin.x + origin.width - box.width : left) + box.width,
      y2: (handle.startsWith('n') ? origin.y + origin.height - box.height : top) + box.height,
      fontSize,
    };
  }

  return { ...data, x1: left, y1: top, x2: left + width, y2: top + height };
}

/** Угол габаритов, который при этой ручке должен остаться на месте. */
function anchorOf(box: Bounds, handle: HandleId): { x: number; y: number } {
  return {
    x: handle.includes('w') ? box.x + box.width : box.x,
    y: handle.startsWith('n') ? box.y + box.height : box.y,
  };
}
