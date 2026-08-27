import type { ItemData, ItemType, LineStyle, Point } from './protocol';

/**
 * Рисование объектов доски на холсте.
 *
 * Вынесено из компонента: этим же кодом рисуется и то, что уже на доске,
 * и то, что человек тянет прямо сейчас, — иначе предпросмотр фигуры
 * отличался бы от неё самой.
 */

/** Штрихи для типа линии. Длины в мировых единицах, поэтому от толщины. */
function dashOf(style: LineStyle | undefined, width: number): number[] {
  const unit = Math.max(1, width);

  if (style === 'dash') return [unit * 3, unit * 2];
  if (style === 'dot') return [unit * 0.1, unit * 2];
  if (style === 'dashdot') return [unit * 3, unit * 1.5, unit * 0.1, unit * 1.5];
  return [];
}

function applyStyle(context: CanvasRenderingContext2D, data: ItemData): void {
  context.strokeStyle = data.color;
  context.fillStyle = data.color;
  context.lineWidth = data.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalAlpha = data.opacity ?? 1;
  context.setLineDash(dashOf(data.lineStyle, data.width));
}

/** Углы фигуры по её габаритам. */
function cornersOf(data: ItemData): Point[] {
  const x1 = data.x1 ?? 0;
  const y1 = data.y1 ?? 0;
  const x2 = data.x2 ?? 0;
  const y2 = data.y2 ?? 0;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const midX = (left + right) / 2;
  const inset = (right - left) * 0.25;

  const at = (x: number, y: number): Point => ({ x, y, p: 1 });

  switch (data.shape) {
    case 'triangle':
      return [at(midX, top), at(right, bottom), at(left, bottom)];
    case 'trapezoid':
      return [at(left + inset, top), at(right - inset, top), at(right, bottom), at(left, bottom)];
    case 'parallelogram':
      return [at(left + inset, top), at(right, top), at(right - inset, bottom), at(left, bottom)];
    case 'rhombus':
      return [at(midX, top), at(right, (top + bottom) / 2), at(midX, bottom), at(left, (top + bottom) / 2)];
    default:
      return [at(left, top), at(right, top), at(right, bottom), at(left, bottom)];
  }
}

function drawStroke(context: CanvasRenderingContext2D, data: ItemData): void {
  const points = data.points;
  if (!points || points.length === 0) return;

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) context.lineTo(point.x, point.y);

  // Одиночная точка отрезком не рисуется — ставим её сами, иначе касание
  // без движения не оставляло бы следа вовсе.
  if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y);

  context.stroke();
}

function drawArrowHead(context: CanvasRenderingContext2D, data: ItemData): void {
  const x1 = data.x1 ?? 0;
  const y1 = data.y1 ?? 0;
  const x2 = data.x2 ?? 0;
  const y2 = data.y2 ?? 0;

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(data.width * 3, 8);

  // Наконечник рисуем сплошным: пунктирная стрелка с пунктирным
  // наконечником выглядит недорисованной.
  context.save();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  context.moveTo(x2, y2);
  context.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  context.stroke();
  context.restore();
}

function drawShape(context: CanvasRenderingContext2D, data: ItemData): void {
  if (data.shape === 'line' || data.shape === 'arrow') {
    context.beginPath();
    context.moveTo(data.x1 ?? 0, data.y1 ?? 0);
    context.lineTo(data.x2 ?? 0, data.y2 ?? 0);
    context.stroke();

    if (data.shape === 'arrow') drawArrowHead(context, data);
    return;
  }

  if (data.shape === 'ellipse') {
    const x1 = data.x1 ?? 0;
    const y1 = data.y1 ?? 0;
    const x2 = data.x2 ?? 0;
    const y2 = data.y2 ?? 0;

    context.beginPath();
    context.ellipse(
      (x1 + x2) / 2, (y1 + y2) / 2,
      Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2,
      0, 0, Math.PI * 2,
    );
    context.stroke();
    return;
  }

  const corners = cornersOf(data);
  context.beginPath();
  context.moveTo(corners[0].x, corners[0].y);
  for (const corner of corners.slice(1)) context.lineTo(corner.x, corner.y);
  context.closePath();
  context.stroke();
}

export function fontOf(data: ItemData): string {
  return `${data.fontSize ?? 24}px Manrope, system-ui, sans-serif`;
}

function drawText(context: CanvasRenderingContext2D, data: ItemData): void {
  if (!data.text) return;

  context.setLineDash([]);
  context.font = fontOf(data);
  context.textBaseline = 'top';

  // Каждая строка отдельно: fillText переносов не делает.
  const lineHeight = (data.fontSize ?? 24) * 1.25;
  data.text.split('\n').forEach((line, index) => {
    context.fillText(line, data.x1 ?? 0, (data.y1 ?? 0) + index * lineHeight);
  });
}

/**
 * Разлиновка холста.
 *
 * Рисуется по видимой области в экранных координатах, а не по всему
 * бесконечному миру: шаг остаётся одинаковым на любом масштабе, и линий
 * всегда столько, сколько помещается в окно.
 */
export function drawGrid(
  context: CanvasRenderingContext2D,
  style: string,
  color: string,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  if (style === 'none') return;

  // Шаг держим в пределах читаемого: на сильном отдалении сетка иначе
  // превращается в сплошную заливку и съедает кадр.
  let step = 32 * scale;
  while (step < 12) step *= 4;
  while (step > 160) step /= 2;

  const startX = offsetX % step;
  const startY = offsetY % step;

  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1;

  if (style === 'dot') {
    for (let x = startX; x < width; x += step) {
      for (let y = startY; y < height; y += step) {
        context.beginPath();
        context.arc(x, y, 1.2, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
    return;
  }

  if (style === 'rhombus') {
    context.beginPath();
    for (let x = startX - height; x < width + height; x += step) {
      context.moveTo(x, 0);
      context.lineTo(x + height, height);
      context.moveTo(x, height);
      context.lineTo(x + height, 0);
    }
    context.stroke();
    context.restore();
    return;
  }

  // Квадрат и график отличаются только частотой крупной линии.
  const bold = style === 'graph' ? 5 : 0;

  const line = (from: number, limit: number, vertical: boolean, index: number) => {
    context.beginPath();
    context.lineWidth = bold > 0 && index % bold === 0 ? 1.5 : 0.6;
    if (vertical) {
      context.moveTo(from, 0);
      context.lineTo(from, limit);
    } else {
      context.moveTo(0, from);
      context.lineTo(limit, from);
    }
    context.stroke();
  };

  let index = 0;
  for (let x = startX; x < width; x += step) line(x, height, true, index++);

  index = 0;
  for (let y = startY; y < height; y += step) line(y, width, false, index++);

  context.restore();
}

export function drawItem(context: CanvasRenderingContext2D, type: ItemType, data: ItemData): void {
  context.save();
  applyStyle(context, data);

  if (type === 'text') drawText(context, data);
  else if (type === 'shape') drawShape(context, data);
  else drawStroke(context, data);

  context.restore();
}

export { cornersOf };
