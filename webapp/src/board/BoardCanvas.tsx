import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { BoardHub } from './useBoardHub';
import type { BoardItem, ItemData, Point } from './protocol';

/** Инструменты этапа 11c. Фигуры и текст добавятся следующим заходом. */
export type Tool = 'pen' | 'eraser';

interface Props {
  hub: BoardHub;
  tool: Tool;
  color: string;
  width: number;
}

/** Не чаще двадцати раз в секунду — предел из раздела 7.1. */
const CURSOR_INTERVAL_MS = 50;

/** Точки штриха копятся и уходят пачками, а не по одной. */
const POINT_BATCH_MS = 50;

/** Насколько близко нужно ткнуть, чтобы стереть штрих. */
const ERASE_RADIUS = 8;

/**
 * Холст доски.
 *
 * Рисование идёт точками по ходу движения и закрепляется одним объектом
 * по завершении штриха: промежуточные точки только рассылаются, в базу
 * не пишутся — иначе на один штрих приходились бы сотни записей
 * (раздел 7.3).
 */
export function BoardCanvas({ hub, tool, color, width }: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  /** Свой штрих, пока он рисуется. В состоянии не держим: перерисовка на
      каждую точку заставляла бы React работать чаще, чем движется рука. */
  const drawing = useRef<{ tempId: string; points: Point[]; sent: number } | null>(null);
  const lastCursor = useRef(0);
  const lastBatch = useRef(0);
  const frame = useRef(0);

  const [size, setSize] = useState({ width: 0, height: 0 });

  // Холст должен занимать всё, что ему отвели, и быть чётким на экранах
  // с удвоенными точками — иначе линия выглядит размытой.
  useEffect(() => {
    const element = box.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Полная перерисовка. Дёшево, пока объектов немного. */
  const redraw = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, element.width, element.height);

    for (const item of hub.items) strokePath(context, item.data);
    for (const stroke of hub.live.values()) strokePath(context, stroke.data);

    if (drawing.current) {
      strokePath(context, { points: drawing.current.points, color, width });
    }
  }, [hub.items, hub.live, color, width]);

  // Перерисовываем в такт кадрам экрана, а не по каждому событию: подряд
  // пришедшие точки от нескольких человек иначе дали бы десятки лишних
  // проходов за один кадр.
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(frame.current);
  }, [redraw, size]);

  const positionOf = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - bounds.left),
      y: Math.round(event.clientY - bounds.top),
      // Нажим есть только у пера. У мыши браузер отдаёт 0.5 при нажатой
      // кнопке — принимать это за половинный нажим значило бы рисовать
      // мышью вдвое тоньше, чем просили.
      p: event.pointerType === 'pen' ? event.pressure || 0.5 : 1,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!hub.canEdit) return;

    // Иначе Safari на касании начинает выделять текст и показывает
    // системное меню поверх доски.
    event.preventDefault();

    const point = positionOf(event);

    if (tool === 'eraser') {
      const hit = topmostAt(hub.items, point);
      if (hit) hub.deleteItems([hit.id]);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    const tempId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    drawing.current = { tempId, points: [point], sent: 0 };

    hub.beginItem(tempId, 'stroke', { points: [point], color, width });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = positionOf(event);
    const now = performance.now();

    if (now - lastCursor.current >= CURSOR_INTERVAL_MS) {
      lastCursor.current = now;
      hub.sendCursor(point.x, point.y);
    }

    const stroke = drawing.current;
    if (!stroke) return;

    stroke.points.push(point);

    if (now - lastBatch.current >= POINT_BATCH_MS) {
      lastBatch.current = now;
      const fresh = stroke.points.slice(stroke.sent);
      stroke.sent = stroke.points.length;
      if (fresh.length > 0) hub.appendPoints(stroke.tempId, fresh);
    }

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(redraw);
  };

  const finish = () => {
    const stroke = drawing.current;
    if (!stroke) return;

    drawing.current = null;

    // Штрих из одной точки — это промах, а не рисунок: не закрепляем.
    if (stroke.points.length > 1) {
      hub.commitItem(stroke.tempId, 'stroke', { points: stroke.points, color, width });
    }

    redraw();
  };

  const ratio = window.devicePixelRatio || 1;

  return (
    <div className="canvas-host" ref={box}>
      <canvas
        ref={canvas}
        width={Math.max(1, Math.round(size.width * ratio))}
        height={Math.max(1, Math.round(size.height * ratio))}
        style={{ width: size.width, height: size.height }}
        className={hub.canEdit ? `canvas-host__surface canvas-host__surface--${tool}` : 'canvas-host__surface'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        // Без onPointerLeave намеренно: указатель захвачен, и штрих,
        // уведённый за край холста, должен продолжаться, а не обрываться.
        // На касании это событие приходит ещё и в начале жеста — с ним
        // палец не рисовал вовсе.
        onPointerCancel={finish}
      />

      {/* Чужие курсоры — обычные элементы поверх холста, а не рисунок на
          нём: иначе каждый кадр курсоров требовал бы перерисовки доски. */}
      {hub.cursors
        .filter((cursor) => cursor.id !== hub.me)
        .map((cursor) => (
          <span className="canvas-cursor" key={cursor.id} style={{ left: cursor.x, top: cursor.y }}>
            <span className="canvas-cursor__name">{cursor.name}</span>
          </span>
        ))}
    </div>
  );
}

/** Рисует штрих по его точкам. */
function strokePath(context: CanvasRenderingContext2D, data: ItemData): void {
  const points = data.points;
  if (!points || points.length === 0) return;

  context.strokeStyle = data.color;
  context.lineWidth = data.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) context.lineTo(point.x, point.y);

  // Одиночная точка отрезком не рисуется — ставим её сами, иначе касание
  // без движения не оставляло бы следа вовсе.
  if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y);

  context.stroke();
}

/** Верхний объект под указателем — для ластика. */
function topmostAt(items: BoardItem[], point: Point): BoardItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const points = item.data.points ?? [];
    const reach = ERASE_RADIUS + item.data.width / 2;

    for (let i = 1; i < points.length; i += 1) {
      if (distanceToSegment(point, points[i - 1], points[i]) <= reach) return item;
    }

    if (points.length === 1 && distanceToSegment(point, points[0], points[0]) <= reach) return item;
  }

  return null;
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  // Отрезок нулевой длины — считаем расстояние до самой точки.
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));

  const nearestX = from.x + t * dx;
  const nearestY = from.y + t * dy;

  return Math.hypot(point.x - nearestX, point.y - nearestY);
}
