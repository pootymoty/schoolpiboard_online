import type { BoardItem, ItemData, Point } from './protocol';
import { cornersOf } from './render';
import { allPoints, segmentsOf } from './strokes';
import { rotated } from './rotate';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Сдвигает геометрию объекта. Тот же расчёт, что и на сервере. */
export function translate(data: ItemData, dx: number, dy: number): ItemData {
  const shift = (point: Point): Point => ({ ...point, x: point.x + dx, y: point.y + dy });

  return {
    ...data,
    points: data.points?.map(shift),
    segments: data.segments?.map((segment) => segment.map(shift)),
    x1: data.x1 === undefined ? undefined : data.x1 + dx,
    y1: data.y1 === undefined ? undefined : data.y1 + dy,
    x2: data.x2 === undefined ? undefined : data.x2 + dx,
    y2: data.y2 === undefined ? undefined : data.y2 + dy,
  };
}

/**
 * Все опорные точки объекта — по ним считаются габариты и попадания.
 * У фигуры это её углы, а не углы габаритов: у треугольника и ромба
 * рамка иначе не совпала бы с нарисованным.
 */
export function pointsOf(data: ItemData): Point[] {
  return rotated(data, localPoints(data));
}

/** Опорные точки до поворота — в них считается вся геометрия объекта. */
function localPoints(data: ItemData): Point[] {
  if (data.points?.length || data.segments?.length) return allPoints(data);

  if (data.x1 === undefined || data.y1 === undefined) return [];

  if (data.text !== undefined) {
    const x2 = data.x2 ?? data.x1;
    const y2 = data.y2 ?? data.y1;
    return [
      { x: data.x1, y: data.y1, p: 1 },
      { x: x2, y: data.y1, p: 1 },
      { x: x2, y: y2, p: 1 },
      { x: data.x1, y: y2, p: 1 },
    ];
  }

  if (data.x2 === undefined || data.y2 === undefined) return [];

  if (data.shape === 'line' || data.shape === 'arrow') {
    return [
      { x: data.x1, y: data.y1, p: 1 },
      { x: data.x2, y: data.y2, p: 1 },
    ];
  }

  // Замкнутая фигура: последнюю сторону дописываем, иначе тычок в неё
  // не засчитывался бы.
  const corners = cornersOf(data);
  return data.shape ? [...corners, corners[0]] : corners;
}

export function boundsOf(items: BoardItem[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    // Толщина учитывается: габариты по осевой линии обрезали бы штрих
    // по краям, и рамка выделения шла бы прямо по нарисованному.
    const pad = item.data.width / 2;

    for (const point of pointsOf(item.data)) {
      minX = Math.min(minX, point.x - pad);
      minY = Math.min(minY, point.y - pad);
      maxX = Math.max(maxX, point.x + pad);
      maxY = Math.max(maxY, point.y + pad);
    }
  }

  if (minX === Infinity) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  // Отрезок нулевой длины — считаем расстояние до самой точки.
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));

  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/** Попадает ли указатель в объект. Радиус — в мировых единицах. */
export function hits(item: BoardItem, point: Point, radius: number): boolean {
  const points = pointsOf(item.data);
  const reach = radius + item.data.width / 2;

  // В надпись, картинку, таблицу и эллипс попадают всей площадью: тыкать
  // ровно в букву или ровно в контур — это соревнование, а не работа.
  // Половина эллипса ловится так же: её габариты — коробка целого
  // эллипса, и попадать в саму дугу означало бы целиться в волосок.
  if (item.type === 'text' || item.type === 'image' || item.type === 'table'
      || item.data.shape === 'ellipse' || item.data.shape === 'arcUp' || item.data.shape === 'arcDown') {
    // У повёрнутого объекта прямоугольник габаритов заметно больше его
    // самого, и он ловил бы тычки далеко за краем. Поэтому по самому
    // четырёхугольнику, каким он лежит на доске.
    if (item.data.angle) return inside(points, point);

    const box = boundsOf([item]);
    return Boolean(box)
      && point.x >= box!.x - radius && point.x <= box!.x + box!.width + radius
      && point.y >= box!.y - radius && point.y <= box!.y + box!.height + radius;
  }

  // Куски штриха проверяются раздельно: сплошным списком отрезок
  // протянулся бы через дыру, которую ластик как раз и вырезал.
  const runs = item.type === 'stroke' ? segmentsOf(item.data) : [points];

  for (const run of runs) {
    if (run.length === 1 && distanceToSegment(point, run[0], run[0]) <= reach) return true;

    for (let index = 1; index < run.length; index += 1) {
      if (distanceToSegment(point, run[index - 1], run[index]) <= reach) return true;
    }
  }

  return false;
}

/** Точка внутри многоугольника — обычный луч вправо и счёт пересечений. */
function inside(corners: Point[], point: Point): boolean {
  let result = false;

  for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
    const a = corners[i];
    const b = corners[j];

    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;

    if (crosses) result = !result;
  }

  return result;
}

/** Верхний объект под указателем. */
export function topmostAt(items: BoardItem[], point: Point, radius: number): BoardItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (hits(items[index], point, radius)) return items[index];
  }

  return null;
}

/** Объекты, целиком попавшие в рамку выделения. */
export function within(items: BoardItem[], area: Bounds): BoardItem[] {
  return items.filter((item) => {
    const points = pointsOf(item.data);
    if (points.length === 0) return false;

    return points.every((point) => (
      point.x >= area.x
      && point.x <= area.x + area.width
      && point.y >= area.y
      && point.y <= area.y + area.height
    ));
  });
}

/** Прямоугольник по двум углам — они могут быть заданы в любом порядке. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
