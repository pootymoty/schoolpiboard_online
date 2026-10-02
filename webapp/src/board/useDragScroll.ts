import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Насколько надо протянуть, чтобы нажатие стало прокруткой, а не щелчком. */
const DRAG_THRESHOLD_PX = 6;

/**
 * Прокрутка полосы инструментов перетаскиванием — мышью и пером.
 *
 * В невысоком окне все кнопки левой полосы не помещаются, и до нижних
 * можно было добраться только колесом. У графического планшета колеса
 * нет, и тянуть руку к мыши посреди урока неудобно: теперь полосу можно
 * прокрутить, нажав на неё и потянув, как карусель.
 *
 * Короткое нажатие без протяжки остаётся обычным щелчком по кнопке; после
 * протяжки щелчок гасится — иначе отпускание над кнопкой выбирало бы
 * инструмент, до которого просто докрутили. Палец сюда не относится: у
 * касания своя прокрутка, браузерная, и она работает и так.
 */
export function useDragScroll(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let drag: {
      pointerId: number;
      x: number;
      y: number;
      left: number;
      top: number;
      moving: boolean;
    } | null = null;

    const scrollable = () => (
      element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1
    );

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0 || !scrollable()) return;

      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: element.scrollLeft,
        top: element.scrollTop,
        moving: false,
      };
    };

    const onMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;

      if (!drag.moving) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.moving = true;
        element.setPointerCapture(event.pointerId);
        element.classList.add('is-drag-scrolling');
      }

      element.scrollLeft = drag.left - dx;
      element.scrollTop = drag.top - dy;
    };

    const onUp = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;

      const moved = drag.moving;
      drag = null;
      element.classList.remove('is-drag-scrolling');
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);

      if (!moved) return;

      // Щелчок, который браузер пришлёт следом за этим отпусканием, — не
      // выбор инструмента, а конец прокрутки.
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      element.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => element.removeEventListener('click', swallow, { capture: true }), 0);
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);

    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  }, [ref]);
}
