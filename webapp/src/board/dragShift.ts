import { useSyncExternalStore } from 'react';

/** Насколько (в мировых единицах) сейчас утащено выделенное. */
export interface Shift {
  dx: number;
  dy: number;
}

const NONE: Shift = { dx: 0, dy: 0 };

/**
 * Сдвиг выделения, пока его тащат.
 *
 * Перетаскивание живёт внутри холста, в ref, а не в состоянии React:
 * перерисовывать на каждый кадр всю страницу доски ради одного объекта
 * дорого. Но панель параметров выделенного должна ехать вместе с ним —
 * иначе она остаётся там, где объект был, и закрывает пустое место.
 * Поэтому холст сообщает сдвиг сюда, а подписана на него только панель.
 */
export function createDragShift() {
  let current: Shift = NONE;
  const listeners = new Set<() => void>();

  return {
    set(dx: number, dy: number) {
      if (dx === current.dx && dy === current.dy) return;
      current = dx === 0 && dy === 0 ? NONE : { dx, dy };
      listeners.forEach((listener) => listener());
    },
    get: (): Shift => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type DragShift = ReturnType<typeof createDragShift>;

export function useDragShift(store: DragShift | undefined): Shift {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.get ?? none,
    none,
  );
}

const none = () => NONE;
const noopSubscribe = () => () => undefined;
