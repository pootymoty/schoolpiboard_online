import type { BoardItem, ItemData, Point } from './protocol';
import { distanceToSegment } from './geometry';
import { segmentsOf, withSegments } from './strokes';

/** Что сделать с объектом после прохода ластика. */
export type EraseResult =
  | { kind: 'keep' }
  | { kind: 'delete' }
  | { kind: 'split'; parts: ItemData[] };

/**
 * Ластик.
 *
 * Стирается только рукописное, и не целиком: от штриха остаются куски —
 * все внутри одного объекта. Иначе одно касание уносило бы всю строчку,
 * написанную одним движением, а стирают обычно букву.
 *
 * Фигуры, надписи, таблицы и картинки ластик не трогает вовсе. Так по
 * ним можно стирать: провёл поверх прямоугольника — исчезли только
 * линии, а сам прямоугольник остался. Убирают их выделением и кнопкой,
 * и это единственный способ — случайно смахнуть фигуру ластиком нельзя.
 */
export function erase(item: BoardItem, at: Point, radius: number): EraseResult {
  if (item.type !== 'stroke' || item.data.locked) return { kind: 'keep' };

  const reach = radius + item.data.width / 2;
  const before = segmentsOf(item.data);
  if (before.length === 0) return { kind: 'keep' };

  const after: Point[][] = [];
  let touched = false;

  for (const segment of before) {
    const pieces = eraseSegment(segment, at, reach);

    if (pieces === null) {
      after.push(segment);
      continue;
    }

    touched = true;
    // Кусок короче двух точек — это уже не линия, а мусор.
    for (const piece of pieces) if (piece.length > 1) after.push(piece);
  }

  if (!touched) return { kind: 'keep' };
  if (after.length === 0) return { kind: 'delete' };

  return { kind: 'split', parts: [withSegments(item.data, after)] };
}

/**
 * Один кусок под ластиком. `null` — ластик его не задел; иначе то, что
 * от него осталось (может быть и пусто).
 */
function eraseSegment(points: Point[], at: Point, reach: number): Point[][] | null {
  const survives = points.map((point) => Math.hypot(point.x - at.x, point.y - at.y) > reach);

  if (survives.every(Boolean)) {
    // Ни одна точка не задета, но ластик мог пройти по отрезку между
    // ними — на длинном прямом участке точек мало.
    for (let index = 1; index < points.length; index += 1) {
      if (distanceToSegment(at, points[index - 1], points[index]) > reach) continue;
      return [points.slice(0, index), points.slice(index)];
    }

    return null;
  }

  const parts: Point[][] = [];
  let run: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    if (survives[index]) {
      run.push(points[index]);
    } else if (run.length > 0) {
      parts.push(run);
      run = [];
    }
  }

  if (run.length > 0) parts.push(run);

  return parts;
}
