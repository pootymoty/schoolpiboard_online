import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { BoardHub } from './useBoardHub';
import type { BoardItem, ItemData, Point } from './protocol';
import { cursorColor } from './cursorColors';
import { clampScale, toScreen, toWorld, zoomAt } from './viewport';
import type { Viewport } from './viewport';

/** Инструменты. Фигуры, текст и выделение добавятся следующим заходом. */
export type Tool = 'hand' | 'pen' | 'eraser';

interface Props {
  hub: BoardHub;
  tool: Tool;
  color: string;
  width: number;
  viewport: Viewport;
  onViewport: (viewport: Viewport) => void;
  onSize: (size: { width: number; height: number }) => void;
}

/** Не чаще двадцати раз в секунду — предел из раздела 7.1. */
const CURSOR_INTERVAL_MS = 50;

/** Точки штриха копятся и уходят пачками, а не по одной. */
const POINT_BATCH_MS = 50;

/** Насколько близко нужно ткнуть, чтобы стереть штрих, в экранных пикселях. */
const ERASE_RADIUS = 8;

/**
 * Холст доски.
 *
 * Объекты хранятся в мировых координатах, а окно смотрит на них через
 * <see cref="Viewport" />: холст бесконечен, и экранные координаты у
 * двоих с разными окнами означали бы разные места.
 *
 * Рисование идёт точками по ходу движения и закрепляется одним объектом
 * по завершении штриха: промежуточные точки только рассылаются, в базу
 * не пишутся (раздел 7.3).
 */
export function BoardCanvas({ hub, tool, color, width, viewport, onViewport, onSize }: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  /** Свой штрих, пока он рисуется. В состоянии не держим: перерисовка на
      каждую точку заставляла бы React работать чаще, чем движется рука. */
  const drawing = useRef<{ tempId: string; points: Point[]; sent: number } | null>(null);

  /** Перетаскивание холста: чем и откуда тащат. */
  const panning = useRef<{ pointerId: number; startX: number; startY: number; origin: Viewport } | null>(null);

  /** Все указатели, лежащие на экране сейчас. Нужны для жестов двумя пальцами. */
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());

  /** Щипок: расстояние и середина между пальцами в начале жеста. */
  const pinch = useRef<{ distance: number; centerX: number; centerY: number; origin: Viewport } | null>(null);

  /**
   * После жеста двумя пальцами оставшийся на экране палец не должен
   * начать рисовать: жест кончается не одновременно с касанием.
   */
  const blockUntilRelease = useRef(false);

  /**
   * Видели ли на этой доске перо. Если видели — палец только двигает
   * холст: на планшете рисуют пером, а ладонь и палец следа оставлять
   * не должны. На телефоне пера нет, и палец, естественно, рисует.
   */
  const penSeen = useRef(false);

  const lastCursor = useRef(0);
  const lastBatch = useRef(0);
  const frame = useRef(0);

  /** Пробел временно включает перемещение при любом инструменте. */
  const [spaceHeld, setSpaceHeld] = useState(false);

  const [size, setSize] = useState({ width: 0, height: 0 });

  // Свежие значения для обработчиков указателя: они живут вне React-цикла
  // и иначе видели бы состояние на момент подписки.
  const latest = useRef({ viewport, tool, color, width, spaceHeld });
  latest.current = { viewport, tool, color, width, spaceHeld };

  useEffect(() => {
    const element = box.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      onSize(next);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);

  // Пробел — как в десктопной версии: держат, чтобы подвигать холст, и
  // отпускают, возвращаясь к рисованию.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      event.preventDefault();
      setSpaceHeld(true);
    };

    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /** Полная перерисовка. */
  const redraw = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const view = latest.current.viewport;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, element.width, element.height);

    // Мир переводится в экран одним преобразованием, а не пересчётом
    // каждой точки: так толщина линии масштабируется вместе с рисунком.
    context.setTransform(
      ratio * view.scale, 0, 0, ratio * view.scale,
      ratio * view.x, ratio * view.y,
    );

    for (const item of hub.items) strokePath(context, item.data);
    for (const stroke of hub.live.values()) strokePath(context, stroke.data);

    if (drawing.current) {
      strokePath(context, {
        points: drawing.current.points,
        color: latest.current.color,
        width: latest.current.width,
      });
    }
  }, [hub.items, hub.live]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(redraw);
  }, [redraw]);

  // Перерисовываем в такт кадрам экрана: подряд пришедшие точки от
  // нескольких человек иначе дали бы десятки лишних проходов за кадр.
  useEffect(() => {
    schedule();
    return () => cancelAnimationFrame(frame.current);
  }, [schedule, size, viewport, color, width]);

  // Колесо — масштаб с привязкой к точке под курсором. Слушатель вешаем
  // сами и не пассивным: иначе браузер не даст отменить прокрутку страницы.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const bounds = element.getBoundingClientRect();
      // Коэффициент пропорционален величине прокрутки — примерно 1.15
      // за щелчок, как в десктопной версии.
      const factor = Math.exp(-event.deltaY * 0.0015);

      onViewport(zoomAt(
        latest.current.viewport,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        factor,
      ));
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [onViewport]);

  const screenPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const worldPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const screen = screenPoint(event);
    const world = toWorld(latest.current.viewport, screen.x, screen.y);

    return {
      x: world.x,
      y: world.y,
      // Нажим есть только у пера. У мыши браузер отдаёт 0.5 при нажатой
      // кнопке — принимать это за половинный нажим значило бы рисовать
      // мышью вдвое тоньше, чем просили.
      p: event.pointerType === 'pen' ? event.pressure || 0.5 : 1,
    };
  };

  /** Бросить начатый штрих: он оказался не линией, а началом жеста. */
  const cancelStroke = () => {
    const stroke = drawing.current;
    if (!stroke) return;

    drawing.current = null;
    hub.cancelItem(stroke.tempId);
    schedule();
  };

  /** Пальцы, лежащие на экране. Мышь и перо в жестах не участвуют. */
  const touches = () => [...pointers.current.entries()].filter(([, p]) => p.type === 'touch');

  const startPinch = () => {
    const [first, second] = touches().slice(0, 2).map(([, p]) => p);
    if (!first || !second) return;

    pinch.current = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      origin: latest.current.viewport,
    };
  };

  /** Тащат ли сейчас холст: рукой, пробелом, средней кнопкой или пальцем при пере. */
  const wantsPan = (event: ReactPointerEvent<HTMLCanvasElement>) =>
    latest.current.tool === 'hand'
    || latest.current.spaceHeld
    || event.button === 1
    || !hub.canEdit
    || (event.pointerType === 'touch' && penSeen.current);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Иначе Safari на касании начинает выделять текст и показывает
    // системное меню поверх доски.
    event.preventDefault();

    if (event.pointerType === 'pen') penSeen.current = true;

    // Если на экране не осталось ни одного указателя, запрет снимаем сам:
    // система может не доставить отпускание — например, когда поверх
    // приложения вклинился системный жест, — и без этого рисование
    // осталось бы заблокированным до перезагрузки страницы.
    if (pointers.current.size === 0) blockUntilRelease.current = false;

    const screen = screenPoint(event);
    pointers.current.set(event.pointerId, { ...screen, type: event.pointerType });

    // Второй палец превращает касание в жест. Начатый штрих отменяем:
    // иначе между пальцами протягивалась бы линия.
    if (touches().length >= 2) {
      cancelStroke();
      panning.current = null;
      blockUntilRelease.current = true;
      startPinch();
      return;
    }

    if (blockUntilRelease.current) return;

    if (wantsPan(event)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      panning.current = {
        pointerId: event.pointerId,
        startX: screen.x,
        startY: screen.y,
        origin: latest.current.viewport,
      };
      return;
    }

    if (!hub.canEdit) return;

    const point = worldPoint(event);

    if (latest.current.tool === 'eraser') {
      const hit = topmostAt(hub.items, point, ERASE_RADIUS / latest.current.viewport.scale);
      if (hit) hub.deleteItems([hit.id]);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    const tempId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    drawing.current = { tempId, points: [point], sent: 0 };

    hub.beginItem(tempId, 'stroke', {
      points: [point],
      color: latest.current.color,
      width: latest.current.width,
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { ...screenPoint(event), type: event.pointerType });
    }

    // Щипок задаёт масштаб и сдвиг разом: пальцы и разводят, и ведут,
    // и разделять эти два движения было бы искусственно.
    const gesture = pinch.current;
    if (gesture) {
      const [first, second] = touches().slice(0, 2).map(([, p]) => p);
      if (!first || !second) return;

      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (gesture.distance <= 0) return;

      const scale = clampScale(gesture.origin.scale * (distance / gesture.distance));
      const world = toWorld(gesture.origin, gesture.centerX, gesture.centerY);

      onViewport({
        scale,
        x: (first.x + second.x) / 2 - world.x * scale,
        y: (first.y + second.y) / 2 - world.y * scale,
      });
      return;
    }

    if (blockUntilRelease.current) return;

    const pan = panning.current;

    if (pan && pan.pointerId === event.pointerId) {
      const screen = screenPoint(event);
      onViewport({
        ...pan.origin,
        x: pan.origin.x + (screen.x - pan.startX),
        y: pan.origin.y + (screen.y - pan.startY),
      });
      return;
    }

    const point = worldPoint(event);
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

    schedule();
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);

    // Один палец из двух убрали — жест окончен, но оставшийся не должен
    // тут же начать рисовать с середины экрана.
    if (touches().length < 2) pinch.current = null;
    if (pointers.current.size === 0) blockUntilRelease.current = false;

    panning.current = null;

    const stroke = drawing.current;
    if (!stroke) return;

    drawing.current = null;

    // Штрих из одной точки — это промах, а не рисунок: не закрепляем.
    if (stroke.points.length > 1) {
      hub.commitItem(stroke.tempId, 'stroke', {
        points: stroke.points,
        color: latest.current.color,
        width: latest.current.width,
      });
    }

    schedule();
  };

  const ratio = window.devicePixelRatio || 1;
  const panMode = tool === 'hand' || spaceHeld || !hub.canEdit;

  return (
    <div className="canvas-host" ref={box}>
      <canvas
        ref={canvas}
        width={Math.max(1, Math.round(size.width * ratio))}
        height={Math.max(1, Math.round(size.height * ratio))}
        style={{ width: size.width, height: size.height }}
        className={`canvas-host__surface canvas-host__surface--${panMode ? 'hand' : tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        // Без onPointerLeave намеренно: указатель захвачен, и штрих,
        // уведённый за край холста, должен продолжаться, а не обрываться.
        onPointerCancel={finish}
        // Долгое нажатие на телефоне иначе открывает системное меню
        // «скопировать / выделить» прямо поверх рисунка.
        onContextMenu={(event) => event.preventDefault()}
      />

      {/* Чужие курсоры — обычные элементы поверх холста, а не рисунок на
          нём: иначе каждый кадр курсоров требовал бы перерисовки доски. */}
      {hub.cursors
        .filter((cursor) => cursor.id !== hub.me)
        .map((cursor) => {
          const screen = toScreen(viewport, cursor.x, cursor.y);
          const tint = cursorColor(cursor.id);

          return (
            <span className="canvas-cursor" key={cursor.id} style={{ left: screen.x, top: screen.y }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 3l14 8-6 1.5L10 19z" fill={tint} stroke="#fff" strokeWidth="1.5" />
              </svg>
              <span className="canvas-cursor__name" style={{ background: tint }}>{cursor.name}</span>
            </span>
          );
        })}
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

/** Верхний объект под указателем — для ластика. Радиус в мировых единицах. */
function topmostAt(items: BoardItem[], point: Point, radius: number): BoardItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const points = item.data.points ?? [];
    const reach = radius + item.data.width / 2;

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

  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

export { clampScale };
