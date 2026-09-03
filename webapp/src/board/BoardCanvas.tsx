import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { BoardHub } from './useBoardHub';
import type { Background, ItemData, ItemType, Point } from './protocol';
import { cursorColor } from './cursorColors';
import { boundsOf, rectFrom, topmostAt, translate, within } from './geometry';
import { centerOf } from './rotate';
import type { Bounds } from './geometry';
import { HANDLE_SIZE, angleTo, handlesFor, resized } from './handles';
import type { HandleId } from './handles';
import { onImageLoaded } from './images';
import { drawGrid, drawItem } from './render';
import type { ToolSettings, Tool } from './tools';
import { clampScale, toScreen, toWorld, zoomAt } from './viewport';
import type { Viewport } from './viewport';

export type { Tool };

interface Props {
  hub: BoardHub;
  tool: Tool;
  settings: ToolSettings;
  viewport: Viewport;
  background: Background;
  selection: number[];
  onViewport: (viewport: Viewport) => void;
  onSize: (size: { width: number; height: number }) => void;
  onSelection: (itemIds: number[]) => void;
  onMoved: (itemIds: number[], dx: number, dy: number) => void;
  /** Объект дорисован. Отправляет его страница — она же ведёт историю. */
  onCommit: (type: ItemType, data: ItemData, tempId: string) => void;
  /** Начали рисовать — панель параметров должна уйти с дороги. */
  onDrawStart: () => void;
  /** Ткнули текстом: здесь появится поле ввода. */
  onTextAt: (world: Point) => void;
  /** Ткнули в ячейку уже выбранной таблицы: там откроется поле ввода. */
  onCellAt: (itemId: number, world: Point) => void;
  /** Ластик прошёл по точке: что стереть и что оставить, решает страница. */
  onErase: (at: Point, radius: number) => void;
  /** Ластик отпустили — можно забыть, что уже стёрли за этот проход. */
  onEraseEnd: () => void;
}

/** Не чаще двадцати раз в секунду — предел из раздела 7.1. */
const CURSOR_INTERVAL_MS = 50;

/** Точки штриха копятся и уходят пачками, а не по одной. */
const POINT_BATCH_MS = 50;

/** Насколько близко нужно ткнуть, чтобы стереть штрих, в экранных пикселях. */
const ERASE_RADIUS = 8;

/** Сколько держать руку на месте, чтобы штрих выпрямился. */
const STRAIGHTEN_HOLD_MS = 600;

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
export function BoardCanvas({
  hub, tool, settings, viewport, background, selection,
  onViewport, onSize, onSelection, onMoved, onCommit, onDrawStart, onTextAt, onCellAt,
  onErase, onEraseEnd,
}: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  /** Свой штрих, пока он рисуется. В состоянии не держим: перерисовка на
      каждую точку заставляла бы React работать чаще, чем движется рука. */
  const drawing = useRef<{
    pointerId: number;
    tempId: string;
    /** Штрих копит точки; фигура — только два угла. */
    points: Point[];
    sent: number;
    from: Point;
    to: Point;
    /**
     * Штрих выпрямлен: вместо всех точек останутся две — начало и конец.
     * Включается Shift или задержкой руки на месте: на планшете Shift
     * нажать нечем, а провести идеально прямую от руки нельзя.
     */
    straight: boolean;
    /** Когда рука в последний раз заметно сдвинулась — для той задержки. */
    movedAt: number;
    /** Часть геометрии для предпросмотра и для закрепления. */
    preview: () => Partial<ItemData>;
  } | null>(null);

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

  /** Рамка выделения, пока её тянут. В мировых координатах. */
  const marquee = useRef<{ pointerId: number; from: Point; to: Point } | null>(null);

  /**
   * Перетаскивание выделенного: откуда начали и сколько уже сдвинули.
   *
   * `edit` — номер объекта, если тычок пришёлся в уже выбранную таблицу
   * или фигуру: там правят содержимое. Решаем по отпусканию: пока палец
   * на экране, это с равным успехом может оказаться перетаскиванием.
   */
  const moving = useRef<
    { pointerId: number; from: Point; dx: number; dy: number; edit: number | null } | null
  >(null);

  /** Указатель, которым сейчас стирают. */
  const erasing = useRef<number | null>(null);

  /** Тычок инструментом «текст»: решаем по отпусканию, а не по нажатию. */
  const tapping = useRef<{ pointerId: number; at: Point; screen: { x: number; y: number } } | null>(null);

  /** Поворот за ручку: с какого угла начали и каким он был у объекта. */
  const rotating = useRef<{
    pointerId: number;
    itemId: number;
    center: Point;
    startAngle: number;
    origin: number;
    data: ItemData;
  } | null>(null);

  /** Растягивание за ручку. */
  const resizing = useRef<{
    pointerId: number;
    itemId: number;
    handle: HandleId;
    origin: Bounds;
    from: Point;
    data: ItemData;
  } | null>(null);

  const lastCursor = useRef(0);
  const lastBatch = useRef(0);
  const frame = useRef(0);

  /** Пробел временно включает перемещение при любом инструменте. */
  const [spaceHeld, setSpaceHeld] = useState(false);

  const [size, setSize] = useState({ width: 0, height: 0 });

  /** Каким объектом обернётся текущий жест рисования. */
  const drawnBy = (): { type: ItemType; data: ItemData } => {
    const { tool: active, settings: current } = latest.current;

    if (active === 'table') {
      const it = current.table;
      return {
        type: 'table',
        data: {
          color: it.color,
          width: it.width,
          fontSize: it.fontSize,
          rows: it.rows,
          cols: it.cols,
          cells: [],
        },
      };
    }

    if (active === 'shapes') {
      const it = current.shapes;
      return {
        type: 'shape',
        data: {
          color: it.color,
          width: it.width,
          opacity: it.opacity / 100,
          shape: it.shape,
          lineStyle: it.lineStyle,
          fill: it.fill || undefined,
        },
      };
    }

    const pen = active === 'pen2' ? current.pen2 : active === 'marker' ? current.marker : current.pen1;

    return {
      type: 'stroke',
      data: {
        color: pen.color,
        width: pen.width,
        opacity: pen.opacity / 100,
        marker: active === 'marker' || undefined,
      },
    };
  };

  // Свежие значения для обработчиков указателя: они живут вне React-цикла
  // и иначе видели бы состояние на момент подписки.
  const latest = useRef({ viewport, tool, settings, spaceHeld, selection, background, items: hub.items });
  latest.current = { viewport, tool, settings, spaceHeld, selection, background, items: hub.items };

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

    // Фон и разлиновка — в экранных координатах, до преобразования мира.
    const view0 = latest.current.background;
    context.fillStyle = view0.background;
    context.fillRect(0, 0, element.width / ratio, element.height / ratio);

    drawGrid(
      context, view0.gridStyle, view0.gridColor,
      element.width / ratio, element.height / ratio,
      view.x, view.y, view.scale,
    );

    // Мир переводится в экран одним преобразованием, а не пересчётом
    // каждой точки: так толщина линии масштабируется вместе с рисунком.
    context.setTransform(
      ratio * view.scale, 0, 0, ratio * view.scale,
      ratio * view.x, ratio * view.y,
    );

    const drag = moving.current;
    const chosen = new Set(latest.current.selection);

    for (const item of hub.items) {
      // Пока выделенное тащат, рисуем его со сдвигом, не дожидаясь
      // ответа сервера: иначе рисунок отставал бы от пальца.
      const grip = resizing.current;
      const spin = rotating.current;

      const shifted = grip?.itemId === item.id
        ? grip.data
        : spin?.itemId === item.id
          ? spin.data
          : drag && chosen.has(item.id) ? translate(item.data, drag.dx, drag.dy) : item.data;

      drawItem(context, item.type, shifted, item.imageRef);
    }

    for (const stroke of hub.live.values()) drawItem(context, stroke.type, stroke.data);

    if (drawing.current) {
      const brush = drawnBy();
      drawItem(context, brush.type, { ...brush.data, ...drawing.current.preview() });
    }

    // Рамка выделения и габариты выбранного — линиями постоянной толщины
    // на экране, поэтому делим на масштаб.
    const hair = 1 / view.scale;

    const selected = hub.items.filter((item) => chosen.has(item.id));
    const box = boundsOf(selected.map((item) => (
      drag ? { ...item, data: translate(item.data, drag.dx, drag.dy) } : item
    )));

    if (box) outline(context, box, '#2E5FA3', hair, [6 * hair, 4 * hair]);

    if (marquee.current) {
      outline(context, rectFrom(marquee.current.from, marquee.current.to), '#2E5FA3', hair, [4 * hair, 3 * hair]);
    }

    // Ручки — только при одном выбранном объекте: у группы неясно, что
    // именно тянут, и в десктопной версии их там тоже нет.
    if (selected.length === 1 && !drag) {
      const single = selected[0];
      const preview = resizing.current?.itemId === single.id ? resizing.current.data : single.data;
      const grips = handlesFor(single, boundsOf([{ ...single, data: preview }])!);

      for (const grip of grips) {
        const half = (HANDLE_SIZE / 2) / view.scale;
        context.save();
        context.setLineDash([]);
        context.fillStyle = '#fff';
        context.strokeStyle = '#2E5FA3';
        context.lineWidth = hair * 1.5;
        context.beginPath();
        context.rect(grip.x - half, grip.y - half, half * 2, half * 2);
        context.fill();
        context.stroke();
        context.restore();
      }
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
  }, [schedule, size, viewport, settings, tool, background]);

  // Картинка приходит из сети позже самого объекта: на её месте всё это
  // время пустая рамка, и без этого она осталась бы там до следующего
  // движения мыши.
  useEffect(() => onImageLoaded(schedule), [schedule]);

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
      erasing.current = null;
      tapping.current = null;
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
    // Ластик стирает своим размером, а выделение — небольшим допуском
    // около указателя: попадать точно в линию иначе слишком трудно.
    const reach = latest.current.tool === 'eraser'
      ? latest.current.settings.eraser.size / 2
      : ERASE_RADIUS / latest.current.viewport.scale;

    if (latest.current.tool === 'eraser') {
      event.currentTarget.setPointerCapture(event.pointerId);
      erasing.current = event.pointerId;
      onErase(point, reach);
      return;
    }

    if (latest.current.tool === 'select') {
      event.currentTarget.setPointerCapture(event.pointerId);

      const chosen = latest.current.selection;

      // Ручка проверяется раньше объектов: она мелкая и лежит поверх, и
      // попадание по ней должно означать растягивание, а не выделение
      // того, что под ней.
      if (chosen.length === 1) {
        const single = latest.current.items.find((item) => item.id === chosen[0]);
        const bounds = single ? boundsOf([single]) : null;

        if (single && bounds) {
          const grip = handlesFor(single, bounds).find((candidate) => (
            Math.abs(candidate.x - point.x) <= HANDLE_SIZE / latest.current.viewport.scale
            && Math.abs(candidate.y - point.y) <= HANDLE_SIZE / latest.current.viewport.scale
          ));

          if (grip?.id === 'rot') {
            const center = centerOf(single.data);

            if (center) {
              rotating.current = {
                pointerId: event.pointerId,
                itemId: single.id,
                center,
                startAngle: angleTo(center, point),
                origin: single.data.angle ?? 0,
                data: single.data,
              };
              return;
            }
          }

          if (grip) {
            resizing.current = {
              pointerId: event.pointerId,
              itemId: single.id,
              handle: grip.id,
              origin: rawBounds(single.data, bounds),
              from: point,
              data: single.data,
            };
            return;
          }
        }
      }

      const hit = topmostAt(hub.items, point, reach);

      if (!hit) {
        // По пустому месту — рамка. Прежнее выделение снимаем сразу:
        // рамка задаёт новое целиком.
        if (!event.ctrlKey && !event.metaKey) onSelection([]);
        marquee.current = { pointerId: event.pointerId, from: point, to: point };
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        onSelection(chosen.includes(hit.id) ? chosen.filter((id) => id !== hit.id) : [...chosen, hit.id]);
        return;
      }

      // Тычок в уже выделенное сохраняет выборку: иначе перетащить
      // несколько объектов было бы нельзя — первый же тычок сбрасывал бы
      // остальные.
      const repeat = chosen.length === 1 && chosen[0] === hit.id;
      if (!chosen.includes(hit.id)) onSelection([hit.id]);

      moving.current = {
        pointerId: event.pointerId,
        from: point,
        dx: 0,
        dy: 0,
        edit: repeat && (hit.type === 'table' || hit.type === 'shape') ? hit.id : null,
      };
      return;
    }

    // Надпись ставится по отпусканию, а не по нажатию: пока палец на
    // экране, это может оказаться началом жеста двумя пальцами, и поле
    // ввода успевало открыться до того, как жест распознан.
    if (latest.current.tool === 'text') {
      event.currentTarget.setPointerCapture(event.pointerId);
      tapping.current = { pointerId: event.pointerId, at: point, screen: screenPoint(event) };
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    onDrawStart();

    const tempId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const brush = drawnBy();

    const record = {
      pointerId: event.pointerId,
      tempId,
      points: [point],
      sent: 0,
      from: point,
      to: point,
      straight: false,
      movedAt: Date.now(),
      preview: (): Partial<ItemData> => {
        if (brush.type === 'shape' || brush.type === 'table') {
          return { x1: record.from.x, y1: record.from.y, x2: record.to.x, y2: record.to.y };
        }

        // Выпрямленный штрих — это те же две точки: начало и то место,
        // где рука сейчас. Нажим берём у последней — так линия остаётся
        // такой же по толщине, какой её вели.
        if (record.straight && record.points.length > 1) {
          const last = record.points[record.points.length - 1];
          return { points: [record.points[0], last] };
        }

        return { points: record.points };
      },
    };

    drawing.current = record;

    // Фигуру рассылать по ходу построения незачем: она задана двумя
    // углами, и до отпускания это лишь предпросмотр у самого рисующего.
    if (brush.type === 'stroke') {
      hub.beginItem(tempId, brush.type, { ...brush.data, points: [point] });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Записываем указатель даже если его нажатие до нас не дошло: так
    // второй палец опознаётся по одному движению, а не только по касанию.
    pointers.current.set(event.pointerId, { ...screenPoint(event), type: event.pointerType });

    if (!pinch.current && touches().length >= 2) {
      cancelStroke();
      panning.current = null;
      erasing.current = null;
      tapping.current = null;
      blockUntilRelease.current = true;
      startPinch();
      return;
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

    if (marquee.current?.pointerId === event.pointerId) {
      marquee.current.to = point;
      schedule();
      return;
    }

    if (erasing.current === event.pointerId) {
      onErase(point, latest.current.settings.eraser.size / 2);
      return;
    }

    const grip = resizing.current;
    if (grip?.pointerId === event.pointerId) {
      const source = latest.current.items.find((item) => item.id === grip.itemId);
      if (source) {
        grip.data = resized(source.data, grip.origin, grip.handle, point.x - grip.from.x, point.y - grip.from.y);
      }
      schedule();
      return;
    }

    const drag = moving.current;
    if (drag?.pointerId === event.pointerId) {
      drag.dx = point.x - drag.from.x;
      drag.dy = point.y - drag.from.y;
      schedule();
      return;
    }

    const now = performance.now();

    if (now - lastCursor.current >= CURSOR_INTERVAL_MS) {
      lastCursor.current = now;
      hub.sendCursor(point.x, point.y);
    }

    const spin = rotating.current;
    if (spin && spin.pointerId === event.pointerId) {
      const turned = spin.origin + (angleTo(spin.center, point) - spin.startAngle);

      // Shift ставит угол на шаг в пятнадцать градусов: ровно поставить
      // фигуру от руки нельзя, а нужно это почти всегда.
      const snapped = event.shiftKey ? Math.round(turned / 15) * 15 : Math.round(turned);

      // Показываем поворот у себя сразу, а на сервер он уйдёт по
      // отпусканию: слать каждый градус — значит слать сотню сообщений
      // за один жест.
      spin.data = { ...spin.data, angle: ((snapped % 360) + 360) % 360 };
      schedule();
      return;
    }

    const stroke = drawing.current;
    // Штрих принадлежит одному указателю. Без этой проверки движения
    // второго пальца дописывались бы в него же — и между пальцами
    // протягивалась линия.
    if (!stroke || stroke.pointerId !== event.pointerId) return;

    if (latest.current.tool === 'shapes' || latest.current.tool === 'table') {
      stroke.to = shiftAware(event, stroke.from, point);
      schedule();
      return;
    }

    // Задержка руки на месте выпрямляет уже проведённое: приём с
    // планшета, где Shift нажать нечем.
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) * latest.current.viewport.scale > 4) {
      stroke.movedAt = now;
    } else if (now - stroke.movedAt > STRAIGHTEN_HOLD_MS) {
      stroke.straight = true;
    }

    if (event.shiftKey) stroke.straight = true;

    stroke.points.push(point);

    if (now - lastBatch.current >= POINT_BATCH_MS) {
      lastBatch.current = now;
      const fresh = stroke.points.slice(stroke.sent);
      stroke.sent = stroke.points.length;

      // Выпрямленный штрих рассылать по точкам бессмысленно: у остальных
      // он всё равно заменится прямой при закреплении.
      if (fresh.length > 0 && !stroke.straight) hub.appendPoints(stroke.tempId, fresh);
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

    if (erasing.current === event.pointerId) {
      erasing.current = null;
      onEraseEnd();
      return;
    }

    const tap = tapping.current;
    if (tap?.pointerId === event.pointerId) {
      tapping.current = null;

      // Тычок засчитываем, только если палец не уехал и на экране больше
      // никого не было: и то и другое означает жест, а не намерение
      // что-то написать.
      const moved = Math.hypot(
        screenPoint(event).x - tap.screen.x,
        screenPoint(event).y - tap.screen.y,
      );

      if (!blockUntilRelease.current && pointers.current.size === 0 && moved < 12) {
        onTextAt(tap.at);
      }
      return;
    }

    const band = marquee.current;
    if (band?.pointerId === event.pointerId) {
      marquee.current = null;
      const chosen = within(latest.current.items, rectFrom(band.from, band.to));
      if (chosen.length > 0) onSelection(chosen.map((item) => item.id));
      schedule();
      return;
    }

    const spin = rotating.current;
    if (spin?.pointerId === event.pointerId) {
      rotating.current = null;
      hub.updateItem(spin.itemId, spin.data);
      schedule();
      return;
    }

    const grip = resizing.current;
    if (grip?.pointerId === event.pointerId) {
      resizing.current = null;
      hub.updateItem(grip.itemId, grip.data);
      schedule();
      return;
    }

    const drag = moving.current;
    if (drag?.pointerId === event.pointerId) {
      moving.current = null;

      if (drag.dx !== 0 || drag.dy !== 0) {
        onMoved(latest.current.selection, drag.dx, drag.dy);
      } else if (drag.edit !== null) {
        // Объект уже был выбран и с места не сдвинулся — значит хотели
        // написать в нём, а не переставить его.
        onCellAt(drag.edit, drag.from);
      }

      schedule();
      return;
    }

    const stroke = drawing.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;

    drawing.current = null;

    const brush = drawnBy();
    const geometry = stroke.preview();

    // Тычок без протяжки — это промах, а не объект: не закрепляем.
    const meaningful = brush.type === 'shape' || brush.type === 'table'
      ? Math.hypot(stroke.to.x - stroke.from.x, stroke.to.y - stroke.from.y) > 2
      : stroke.points.length > 1;

    if (meaningful) {
      onCommit(brush.type, { ...brush.data, ...geometry }, stroke.tempId);
    } else if (brush.type === 'stroke') {
      hub.cancelItem(stroke.tempId);
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

/** Пунктирный прямоугольник: рамка выделения и габариты выбранного. */
function outline(
  context: CanvasRenderingContext2D,
  box: Bounds,
  color: string,
  lineWidth: number,
  dash: number[],
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash(dash);
  context.strokeRect(box.x, box.y, box.width, box.height);
  context.restore();
}

/**
 * Габариты без запаса на толщину линии.
 *
 * `boundsOf` прибавляет половину толщины, чтобы рамка не резала штрих.
 * Для растягивания это лишнее: считать от такой рамки — значит смещать
 * фигуру на половину толщины при каждом захвате.
 */
function rawBounds(data: ItemData, fallback: Bounds): Bounds {
  if (data.x1 === undefined || data.y1 === undefined) return fallback;

  const x2 = data.x2 ?? data.x1;
  const y2 = data.y2 ?? data.y1;

  return {
    x: Math.min(data.x1, x2),
    y: Math.min(data.y1, y2),
    width: Math.abs(x2 - data.x1),
    height: Math.abs(y2 - data.y1),
  };
}

/**
 * Shift при построении фигуры: правильная фигура, а для линий и стрелок —
 * привязка угла к шагу в пятнадцать градусов.
 */
function shiftAware(
  event: ReactPointerEvent<HTMLCanvasElement>,
  from: Point,
  to: Point,
): Point {
  if (!event.shiftKey) return to;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return to;

  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;

  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length, p: 1 };
}

export { clampScale };
