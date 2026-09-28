import type { BoardItem, ItemData, ItemType, Point } from './protocol';
import { pointsOf } from './geometry';
import { segmentsOf, withSegments } from './strokes';

/** Что сделать с объектом после прохода ластика. */
export type EraseResult =
  | { kind: 'keep' }
  | { kind: 'delete' }
  /**
   * Осталась часть. `type` — чем она теперь будет: фигура «Линия», по
   * которой прошёл ластик, становится штрихом из оставшихся отрезков.
   */
  | { kind: 'split'; type: ItemType; parts: ItemData[] };

/** Обрезок короче этого (в мировых единицах) — уже не линия, а мусор. */
const MIN_PIECE = 0.5;

/**
 * Ластик.
 *
 * Стирается рукописное и прямые линии, и не целиком: от них остаются
 * куски — все внутри одного объекта. Иначе одно касание уносило бы всю
 * строчку, написанную одним движением, а стирают обычно букву. Прямая —
 * нарисованная пером (с Shift или задержкой руки) или фигурой «Линия» —
 * стирается так же, участками: это тот же отрезок, как бы его ни
 * построили. Стрелка — нет: без наконечника или без начала она уже не
 * стрелка.
 *
 * Остальные фигуры, надписи, таблицы и картинки ластик не трогает вовсе.
 * Так по ним можно стирать: провёл поверх прямоугольника — исчезли только
 * линии, а сам прямоугольник остался. Убирают их выделением и кнопкой.
 */
export function erase(item: BoardItem, at: Point, radius: number): EraseResult {
  if (item.data.locked) return { kind: 'keep' };

  const line = item.type === 'shape' && item.data.shape === 'line';
  if (item.type !== 'stroke' && !line) return { kind: 'keep' };

  const reach = radius + item.data.width / 2;

  // Фигура «Линия» — это два конца, уже с учётом поворота; дальше с ней
  // обращаемся как со штрихом из двух точек.
  const before = line ? [pointsOf(item.data)] : segmentsOf(item.data);
  if (before.length === 0 || before[0].length === 0) return { kind: 'keep' };

  const after: Point[][] = [];
  let touched = false;

  for (const segment of before) {
    const pieces = eraseSegment(segment, at, reach);

    if (pieces === null) {
      after.push(segment);
      continue;
    }

    touched = true;
    for (const piece of pieces) if (lengthOf(piece) >= MIN_PIECE) after.push(piece);
  }

  if (!touched) return { kind: 'keep' };
  if (after.length === 0) return { kind: 'delete' };

  // Оставшееся от «Линии» — штрих того же вида: цвет, толщина,
  // прозрачность и тип линии те же, габаритов и поворота фигуры больше нет.
  const base: ItemData = line
    ? {
      color: item.data.color,
      width: item.data.width,
      opacity: item.data.opacity,
      lineStyle: item.data.lineStyle,
    }
    : item.data;

  return { kind: 'split', type: 'stroke', parts: [withSegments(base, after)] };
}

/**
 * Один кусок под ластиком. `null` — ластик его не задел; иначе то, что
 * от него осталось (может быть и пусто).
 *
 * Режется не по точкам, а по самим отрезкам между ними: из каждого
 * вырезается ровно та часть, что попала в круг ластика. По точкам
 * прямая — у неё их всего две, на концах, — при касании посередине
 * пропадала целиком: от неё оставались две одинокие точки.
 */
function eraseSegment(points: Point[], at: Point, reach: number): Point[][] | null {
  const inside = (point: Point) => Math.hypot(point.x - at.x, point.y - at.y) <= reach;

  if (points.length === 1) return inside(points[0]) ? [] : null;

  const parts: Point[][] = [];
  let run: Point[] = inside(points[0]) ? [] : [points[0]];
  let touched = false;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const hit = circleSpan(from, to, at, reach);

    if (hit === null) {
      run.push(to);
      continue;
    }

    touched = true;
    const [enter, leave] = hit;

    // До входа в круг — хвост текущего куска; после выхода — начало
    // следующего.
    if (enter > 0) run.push(lerp(from, to, enter));
    if (run.length > 1) parts.push(run);
    run = leave < 1 ? [lerp(from, to, leave), to] : [];
  }

  if (!touched) return null;
  if (run.length > 1) parts.push(run);

  return parts;
}

/**
 * Где отрезок проходит внутри круга: доли его длины от 0 до 1 на входе и
 * на выходе, или `null`, если не проходит вовсе.
 */
function circleSpan(from: Point, to: Point, center: Point, radius: number): [number, number] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - center.x;
  const fy = from.y - center.y;

  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - radius * radius;

  // Отрезок нулевой длины — просто точка.
  if (a === 0) return c <= 0 ? [0, 1] : null;

  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return null;

  const root = Math.sqrt(discriminant);
  const enter = (-b - root) / (2 * a);
  const leave = (-b + root) / (2 * a);

  if (leave < 0 || enter > 1) return null;

  return [Math.max(0, enter), Math.min(1, leave)];
}

function lerp(from: Point, to: Point, t: number): Point {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    p: from.p + (to.p - from.p) * t,
  };
}

function lengthOf(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}
