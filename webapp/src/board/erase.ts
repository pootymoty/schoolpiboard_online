import type { BoardItem, ItemData, Point } from './protocol';
import { distanceToSegment } from './geometry';

/** Что сделать с объектом после прохода ластика. */
export type EraseResult =
  | { kind: 'keep' }
  | { kind: 'delete' }
  | { kind: 'split'; parts: ItemData[] };

/**
 * Ластик.
 *
 * Штрих не удаляется целиком: стирается только задетая часть, а от
 * остального остаются куски. Иначе одно касание уносило бы всю строчку,
 * написанную одним движением, — а стирают обычно букву.
 *
 * Фигуры, надписи и стрелки удаляются целиком при попадании: у них нет
 * «части», которую осмысленно оставить. Картинки ластик не трогает
 * вовсе — их убирают только кнопкой.
 */
export function erase(item: BoardItem, at: Point, radius: number): EraseResult {
  if (item.type === 'image') return { kind: 'keep' };

  const reach = radius + item.data.width / 2;

  if (item.type !== 'stroke') {
    return hitsAnySegment(item, at, reach) ? { kind: 'delete' } : { kind: 'keep' };
  }

  const points = item.data.points ?? [];
  if (points.length === 0) return { kind: 'keep' };

  // Точки внутри круга выпадают, соседние остаются — так штрих
  // распадается на куски по месту касания.
  const survives = points.map((point) => Math.hypot(point.x - at.x, point.y - at.y) > reach);
  if (survives.every(Boolean)) {
    // Ни одна точка не задета, но ластик мог пройти по отрезку между
    // ними — на длинном прямом участке точек мало.
    return crossesSegment(points, at, reach) ? splitBySegment(item.data, points, at, reach) : { kind: 'keep' };
  }

  const parts: ItemData[] = [];
  let run: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    if (survives[index]) {
      run.push(points[index]);
    } else if (run.length > 0) {
      parts.push({ ...item.data, points: run });
      run = [];
    }
  }

  if (run.length > 0) parts.push({ ...item.data, points: run });

  // Куски короче двух точек — это уже не линия, а мусор.
  const kept = parts.filter((part) => (part.points?.length ?? 0) > 1);
  return kept.length === 0 ? { kind: 'delete' } : { kind: 'split', parts: kept };
}

function hitsAnySegment(item: BoardItem, at: Point, reach: number): boolean {
  const x1 = item.data.x1 ?? 0;
  const y1 = item.data.y1 ?? 0;
  const x2 = item.data.x2 ?? x1;
  const y2 = item.data.y2 ?? y1;

  // По габаритам: у надписи и замкнутой фигуры засчитываем всю площадь.
  return at.x >= Math.min(x1, x2) - reach && at.x <= Math.max(x1, x2) + reach
    && at.y >= Math.min(y1, y2) - reach && at.y <= Math.max(y1, y2) + reach;
}

function crossesSegment(points: Point[], at: Point, reach: number): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(at, points[index - 1], points[index]) <= reach) return true;
  }

  return false;
}

/** Разрез длинного отрезка: точку разрыва вставляем сами. */
function splitBySegment(data: ItemData, points: Point[], at: Point, reach: number): EraseResult {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(at, points[index - 1], points[index]) > reach) continue;

    const before = points.slice(0, index);
    const after = points.slice(index);
    const parts = [before, after].filter((part) => part.length > 1).map((part) => ({ ...data, points: part }));

    return parts.length === 0 ? { kind: 'delete' } : { kind: 'split', parts };
  }

  return { kind: 'keep' };
}
