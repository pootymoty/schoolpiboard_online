import type { Background, BoardItem, LiveStroke } from './protocol';
import { translate } from './geometry';
import { DEFAULT_BACKGROUND } from './protocol';

/** Вид ведущего в какой-то момент записи — страница, точка в её центре, масштаб. */
export interface PlaybackViewport {
  pageId: number;
  x: number;
  y: number;
  scale: number;
}

export interface PlaybackState {
  items: BoardItem[];
  live: Map<string, LiveStroke>;
  background: Background;
  /** Пусто, пока не пришёл первый ViewportChanged — такое бывает только у самого начала записи. */
  viewport: PlaybackViewport | null;
}

export const EMPTY_PLAYBACK: PlaybackState = {
  items: [],
  live: new Map(),
  background: DEFAULT_BACKGROUND,
  viewport: null,
};

/**
 * Применяет один шаг записи к состоянию воспроизведения.
 *
 * Тот же набор событий и та же логика, что у живого хаба
 * (`useBoardHub`'s `apply`), но чистой функцией: там состояние меняют
 * сеттеры React, а тут нужна произвольная перемотка вперёд и назад.
 * Переходы страниц и присутствие сюда не входят: запись смотрят не
 * выбирая страницу, а участников в ней нет — замки тоже не показывают,
 * они только про живое совместное редактирование.
 */
export function applyRecordedStep(state: PlaybackState, name: string, payload: any): PlaybackState {
  switch (name) {
    // Вид ведущего — с него и начинается запись: до первого такого шага
    // страница ещё не определена, и следующие два случая ниже принимают
    // событие любой страницы, а не отбрасывают его молча.
    case 'ViewportChanged':
      return { ...state, viewport: payload as PlaybackViewport };

    case 'ItemBegan': {
      if (state.viewport && payload.pageId !== state.viewport.pageId) return state;

      const live = new Map(state.live);
      live.set(payload.tempId, payload as LiveStroke);
      return { ...state, live };
    }

    case 'ItemPoints': {
      const stroke = state.live.get(payload.tempId);
      if (!stroke) return state;

      const live = new Map(state.live);
      live.set(payload.tempId, {
        ...stroke,
        data: { ...stroke.data, points: [...(stroke.data.points ?? []), ...payload.points] },
      });
      return { ...state, live };
    }

    case 'ItemCancelled': {
      const live = new Map(state.live);
      live.delete(payload.tempId);
      return { ...state, live };
    }

    case 'ItemCommitted': {
      const live = new Map(state.live);
      live.delete(payload.tempId);

      if (state.viewport && payload.pageId !== state.viewport.pageId) return { ...state, live };

      const items = [...state.items.filter((x) => x.id !== payload.item.id), payload.item];
      return { ...state, items, live };
    }

    case 'ItemsMoved':
      return {
        ...state,
        items: state.items.map((item) => (
          payload.itemIds.includes(item.id) ? { ...item, data: translate(item.data, payload.dx, payload.dy) } : item
        )),
      };

    case 'ItemsReordered': {
      const fresh = new Map<number, BoardItem>((payload.items as BoardItem[]).map((item) => [item.id, item]));
      const items = state.items
        .map((item) => fresh.get(item.id) ?? item)
        .sort((a, b) => a.z - b.z || a.id - b.id);
      return { ...state, items };
    }

    case 'BackgroundChanged':
      return { ...state, background: payload as Background };

    case 'ItemUpdated':
      return { ...state, items: state.items.map((x) => (x.id === payload.item.id ? payload.item : x)) };

    case 'ItemsDeleted':
      return { ...state, items: state.items.filter((x) => !payload.itemIds.includes(x.id)) };

    case 'BoardCleared':
      if (state.viewport && payload.pageId !== state.viewport.pageId) return state;
      return { ...state, items: [], live: new Map() };

    default:
      return state;
  }
}
