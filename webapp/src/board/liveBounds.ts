import { useSyncExternalStore } from 'react';
import type { Bounds } from './geometry';

/**
 * Габариты выделенного, пока его тащат, растягивают или поворачивают.
 *
 * Жест живёт внутри холста, в ref, а не в состоянии React: перерисовывать
 * на каждый кадр всю страницу доски ради одного объекта дорого. Но панель
 * параметров выделенного должна ехать вместе с ним — иначе она остаётся
 * там, где объект был до жеста. Поэтому холст сообщает габариты сюда, а
 * подписана на них только панель. Пусто — жеста нет, панель стоит по
 * сохранённому.
 */
export function createLiveBounds() {
  let current: Bounds | null = null;
  const listeners = new Set<() => void>();

  const same = (a: Bounds | null, b: Bounds | null) => (
    a === b || (a !== null && b !== null
      && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
  );

  return {
    set(next: Bounds | null) {
      if (same(current, next)) return;
      current = next;
      listeners.forEach((listener) => listener());
    },
    get: (): Bounds | null => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type LiveBounds = ReturnType<typeof createLiveBounds>;

export function useLiveBounds(store: LiveBounds | undefined): Bounds | null {
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.get ?? nothing, nothing);
}

const nothing = () => null;
const noopSubscribe = () => () => undefined;
