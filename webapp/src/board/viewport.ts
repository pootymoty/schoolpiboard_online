import type { Point } from './protocol';

/**
 * Что видно на холсте.
 *
 * Холст бесконечен, поэтому объекты хранятся в мировых координатах, а
 * окно смотрит на них через сдвиг и масштаб. Хранить экранные координаты
 * было бы нельзя: у двоих с разными окнами и разным масштабом это разные
 * числа для одной и той же линии.
 */
export interface Viewport {
  /** Куда уехало начало мировых координат, в экранных пикселях. */
  x: number;
  y: number;
  scale: number;
}

/** Пределы масштаба — те же, что в десктопной версии. */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 20;

export const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function toWorld(viewport: Viewport, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - viewport.x) / viewport.scale,
    y: (screenY - viewport.y) / viewport.scale,
  };
}

export function toScreen(viewport: Viewport, worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: worldX * viewport.scale + viewport.x,
    y: worldY * viewport.scale + viewport.y,
  };
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Масштабирование с привязкой к точке под указателем: она должна остаться
 * ровно под ним. Без этого при увеличении уезжает то самое место, ради
 * которого увеличивали.
 */
export function zoomAt(viewport: Viewport, screenX: number, screenY: number, factor: number): Viewport {
  const scale = clampScale(viewport.scale * factor);
  const world = toWorld(viewport, screenX, screenY);

  return {
    scale,
    x: screenX - world.x * scale,
    y: screenY - world.y * scale,
  };
}

/** Поставить мировую точку в середину окна, не меняя масштаба. */
export function centerOn(
  viewport: Viewport,
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  scale = viewport.scale,
): Viewport {
  return {
    scale,
    x: width / 2 - worldX * scale,
    y: height / 2 - worldY * scale,
  };
}

/** Показать всё содержимое доски. */
export function fitToContent(
  points: Point[],
  width: number,
  height: number,
  padding = 48,
): Viewport | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);

  const scale = clampScale(Math.min(
    (width - padding * 2) / contentWidth,
    (height - padding * 2) / contentHeight,
  ));

  return {
    scale,
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 - ((minY + maxY) / 2) * scale,
  };
}
