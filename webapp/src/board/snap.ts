import type { Point } from './protocol';

/**
 * Прилипание к сетке.
 *
 * Шаг тот же, что у разлиновки: прилипать к невидимой сетке, не
 * совпадающей с нарисованной, — значит получать ровное на глаз кривое.
 *
 * Выключено по умолчанию. От руки рисуют там, где хотят, и прилипание в
 * этот момент только дёргает; включают его, когда строят чертёж.
 */
export const GRID_STEP = 32;

export function snapValue(value: number, on: boolean): number {
  return on ? Math.round(value / GRID_STEP) * GRID_STEP : value;
}

export function snapPoint(point: Point, on: boolean): Point {
  if (!on) return point;
  return { ...point, x: snapValue(point.x, true), y: snapValue(point.y, true) };
}
