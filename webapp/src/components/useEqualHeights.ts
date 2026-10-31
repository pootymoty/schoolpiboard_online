import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Карточки сетки — одной высоты, по самой высокой, во всех рядах.
 *
 * В одном ряду их и так выравнивает сам ряд, а вот ряды между собой — нет:
 * под короткими карточками второй ряд выходил ниже первого, и сетка
 * смотрелась вразнобой. Пересчитывается при любом изменении ширины: на
 * узком окне текст переносится, и самая высокая карточка становится другой.
 */
export function useEqualHeights<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;

    let frame = 0;

    const fit = () => {
      const cards = [...grid.children] as HTMLElement[];
      for (const card of cards) card.style.minHeight = '';

      // Одна колонка — карточки друг под другом, равнять незачем.
      const first = cards[0]?.getBoundingClientRect();
      const together = cards.some((card) => card.getBoundingClientRect().top === first?.top && card !== cards[0]);
      if (!together) return;

      const tallest = Math.max(...cards.map((card) => card.getBoundingClientRect().height));
      for (const card of cards) card.style.minHeight = `${tallest}px`;
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });

    observer.observe(grid);
    fit();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return ref;
}
