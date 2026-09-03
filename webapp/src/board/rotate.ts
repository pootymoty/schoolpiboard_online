import type { ItemData, Point } from './protocol';

/**
 * Поворот объектов.
 *
 * Угол хранится один — в градусах, вокруг середины габаритов. Сами
 * координаты остаются неповёрнутыми: так растягивание, привязки и
 * пересчёт габаритов считаются в прямых осях, а поворот применяется
 * только при отрисовке и при проверке попадания.
 */

/** Есть ли у объекта габариты, вокруг которых его можно вращать. */
export function boxOf(data: ItemData): { x: number; y: number; width: number; height: number } | null {
  if (data.x1 === undefined || data.y1 === undefined) return null;

  const x2 = data.x2 ?? data.x1;
  const y2 = data.y2 ?? data.y1;

  return {
    x: Math.min(data.x1, x2),
    y: Math.min(data.y1, y2),
    width: Math.abs(x2 - data.x1),
    height: Math.abs(y2 - data.y1),
  };
}

/** Середина габаритов — вокруг неё всё и вертится. */
export function centerOf(data: ItemData): Point | null {
  const box = boxOf(data);
  if (!box) return null;

  return { x: box.x + box.width / 2, y: box.y + box.height / 2, p: 1 };
}

export function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Точка, повёрнутая вокруг центра на заданный угол в градусах. */
export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  if (!degrees) return point;

  const angle = radians(degrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    ...point,
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Те же точки, но с учётом поворота объекта. */
export function rotated(data: ItemData, points: Point[]): Point[] {
  const angle = data.angle ?? 0;
  if (!angle) return points;

  const center = centerOf(data);
  if (!center) return points;

  return points.map((point) => rotatePoint(point, center, angle));
}
