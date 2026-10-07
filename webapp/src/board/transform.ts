import type { ItemData, ItemType, Point } from './protocol';
import { pointsOf, translate } from './geometry';
import { boxOf, centerOf, rotatePoint } from './rotate';

/**
 * Поворот, отражение и масштаб объектов вокруг общей точки.
 *
 * Нужны, когда преобразуют не один объект вокруг его собственной
 * середины, а выделение целиком: три прямые, сложенные в треугольник,
 * должны повернуться треугольником, а не каждая на месте.
 *
 * Как именно преобразуется объект, зависит от его устройства:
 *
 * - штрих и прямая (фигуры «Линия» и «Стрелка») — точками: у них нет
 *   габаритов, вокруг которых можно было бы хранить угол, и поворот
 *   с отражением записываются прямо в координаты;
 * - фигура, картинка, надпись, таблица — по габаритам: середина
 *   переезжает, угол и отражение хранятся рядом, сами углы рамки остаются
 *   прямыми (так растягивание и привязки считаются в обычных осях);
 * - закладка — только переезжает: это точка с подписью;
 * - группа — каждым объектом своего состава.
 *
 * Надпись и таблица не отражаются: читать текст задом наперёд незачем.
 * В составе выделения они переезжают на отражённое место, а сами
 * остаются как были.
 */

type Axis = 'x' | 'y';

const mapStroke = (data: ItemData, map: (point: Point) => Point): ItemData => ({
  ...data,
  points: data.points?.map(map),
  segments: data.segments?.map((segment) => segment.map(map)),
});

/** Прямая, у которой концы — сами координаты, а не габариты. */
const isLine = (type: ItemType, data: ItemData) => (
  type === 'shape' && (data.shape === 'line' || data.shape === 'arrow')
);

/** Концы прямой с учётом её возможного поворота — дальше они «запекаются». */
const lineEnds = (data: ItemData, map: (point: Point) => Point): ItemData => {
  const [a, b] = pointsOf(data);
  if (!a || !b) return data;

  const from = map(a);
  const to = map(b);

  return { ...data, x1: from.x, y1: from.y, x2: to.x, y2: to.y, angle: undefined, flipX: undefined, flipY: undefined };
};

/** Переносит объект с габаритами так, чтобы его середина попала в `target`. */
const moveCenterTo = (data: ItemData, target: Point): ItemData => {
  const center = centerOf(data);
  if (!center) return data;
  return translate(data, target.x - center.x, target.y - center.y);
};

const normalize = (degrees: number) => {
  const value = ((degrees % 360) + 360) % 360;
  return value === 0 ? undefined : value;
};

/** Поворот вокруг точки `pivot` на `degrees` градусов по часовой. */
export function rotateData(type: ItemType, data: ItemData, pivot: Point, degrees: number): ItemData {
  if (!degrees) return data;

  const turn = (point: Point) => rotatePoint(point, pivot, degrees);

  if (type === 'group') {
    return {
      ...data,
      children: data.children?.map((child) => ({ ...child, data: rotateData(child.type, child.data, pivot, degrees) })),
    };
  }

  if (type === 'stroke') return mapStroke(data, turn);
  if (isLine(type, data)) return lineEnds(data, turn);

  const center = centerOf(data);
  if (!center) return data;

  const moved = moveCenterTo(data, turn(center));

  // Закладка — точка с подписью: подпись всегда читается прямо.
  if (type === 'bookmark') return moved;

  return { ...moved, angle: normalize((data.angle ?? 0) + degrees) };
}

/**
 * Отражение через прямую: `axis = 'x'` — слева направо, через
 * вертикаль x = `at`; `axis = 'y'` — сверху вниз, через горизонталь y = `at`.
 *
 * Отражённый повёрнутый объект — тот же объект, отражённый у себя на
 * месте и повёрнутый на обратный угол; поэтому угол меняет знак, а
 * отражение переключается.
 */
export function mirrorData(type: ItemType, data: ItemData, axis: Axis, at: number): ItemData {
  const reflect = (point: Point): Point => (
    axis === 'x' ? { ...point, x: 2 * at - point.x } : { ...point, y: 2 * at - point.y }
  );

  if (type === 'group') {
    return {
      ...data,
      children: data.children?.map((child) => ({ ...child, data: mirrorData(child.type, child.data, axis, at) })),
    };
  }

  if (type === 'stroke') return mapStroke(data, reflect);
  if (isLine(type, data)) return lineEnds(data, reflect);

  const center = centerOf(data);
  if (!center) return data;

  const moved = moveCenterTo(data, reflect(center));
  if (type === 'bookmark') return moved;

  const angle = data.angle ? normalize(-data.angle) : undefined;

  // Текст и таблица — на отражённое место, но не задом наперёд.
  if (type === 'text' || type === 'table') return { ...moved, angle };

  return {
    ...moved,
    angle,
    flipX: axis === 'x' ? !data.flipX || undefined : data.flipX,
    flipY: axis === 'y' ? !data.flipY || undefined : data.flipY,
  };
}

/** Можно ли объект отразить сам по себе (а не только переставить). */
export function mirrorable(type: ItemType): boolean {
  return type !== 'text' && type !== 'table' && type !== 'bookmark';
}

/**
 * Пропорциональный масштаб от неподвижной точки `anchor` — растягивание
 * группы за угол. Толщина линий остаётся прежней: увеличенный чертёж
 * с вдвое более жирными линиями выглядит не увеличенным, а другим.
 * Шрифт надписей растёт вместе с ними — иначе текст вылезал бы из рамки.
 */
export function scaleData(type: ItemType, data: ItemData, anchor: Point, factor: number): ItemData {
  if (factor === 1) return data;

  const scale = (point: Point): Point => ({
    ...point,
    x: anchor.x + (point.x - anchor.x) * factor,
    y: anchor.y + (point.y - anchor.y) * factor,
  });

  if (type === 'group') {
    return {
      ...data,
      children: data.children?.map((child) => ({ ...child, data: scaleData(child.type, child.data, anchor, factor) })),
    };
  }

  if (type === 'stroke') return mapStroke(data, scale);
  if (isLine(type, data)) return lineEnds(data, scale);

  const box = boxOf(data);
  const center = centerOf(data);
  if (!box || !center) return data;

  const target = scale(center);
  if (type === 'bookmark') return moveCenterTo(data, target);

  const halfW = (box.width / 2) * factor;
  const halfH = (box.height / 2) * factor;

  // Порядок углов сохраняем: у некоторых объектов он что-то значит
  // (откуда тянули фигуру).
  const leftFirst = (data.x1 ?? 0) <= (data.x2 ?? data.x1 ?? 0);
  const topFirst = (data.y1 ?? 0) <= (data.y2 ?? data.y1 ?? 0);

  return {
    ...data,
    x1: leftFirst ? target.x - halfW : target.x + halfW,
    x2: leftFirst ? target.x + halfW : target.x - halfW,
    y1: topFirst ? target.y - halfH : target.y + halfH,
    y2: topFirst ? target.y + halfH : target.y - halfH,
    fontSize: data.fontSize !== undefined ? Math.max(6, Math.round(data.fontSize * factor * 10) / 10) : undefined,
  };
}
