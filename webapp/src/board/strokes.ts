import type { ItemData, Point } from './protocol';

/**
 * Куски рукописного штриха.
 *
 * Штрих, разрезанный ластиком, остаётся одним объектом с несколькими
 * кусками. Иначе строчка, стёртая в трёх местах, превращалась бы в
 * четыре отдельных объекта: четыре рамки выделения, четыре записи в
 * истории и четыре штуки, которые нужно выделять по одной.
 *
 * Старые штрихи кусков не имеют — у них только `points`. Читать их
 * должно и то и другое, поэтому здесь одно место, где эта разница
 * скрыта.
 */
export function segmentsOf(data: ItemData): Point[][] {
  if (data.segments?.length) return data.segments;
  return data.points?.length ? [data.points] : [];
}

/**
 * Штрих с новым набором кусков.
 *
 * Один кусок пишется в `points`: так объект остаётся в прежнем виде и
 * читается всем, что было написано до появления кусков.
 */
export function withSegments(data: ItemData, segments: Point[][]): ItemData {
  if (segments.length <= 1) {
    return { ...data, points: segments[0] ?? [], segments: undefined };
  }

  return { ...data, points: segments[0], segments };
}

/** Все точки штриха подряд — для габаритов, где разрывы не важны. */
export function allPoints(data: ItemData): Point[] {
  return segmentsOf(data).flat();
}
