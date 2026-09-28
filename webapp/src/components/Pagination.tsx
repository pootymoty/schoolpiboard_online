import type { ReactElement } from 'react';
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from './Icons';

/** Сколько номеров страниц показывать по обе стороны от текущей. */
const PAGE_SPAN = 2;

/**
 * Листалка страниц: в начало, назад, по два номера вокруг текущей,
 * вперёд, в конец. Кнопки у краёв не прячутся, а гаснут — иначе на
 * первой и последней странице остальные съезжали бы под пальцем.
 *
 * Одна и та же и в «Моих досках», и в таблицах администрирования: у
 * каждого списка свой номер страницы, листалка только его показывает.
 */
export function Pagination({ page, count, onPage, label }: {
  page: number;
  count: number;
  onPage: (page: number) => void;
  /** Что листаем — для скринридера: на странице листалок может быть несколько. */
  label: string;
}): ReactElement {
  const from = Math.max(1, page - PAGE_SPAN);
  const to = Math.min(count, page + PAGE_SPAN);
  const numbers = Array.from({ length: to - from + 1 }, (_, index) => from + index);

  return (
    <nav className="pagination" aria-label={label}>
      <button className="btn-tool" type="button" onClick={() => onPage(1)} disabled={page === 1}
              aria-label="Первая страница" title="Первая страница">
        <IconChevronsLeft />
      </button>
      <button className="btn-tool" type="button" onClick={() => onPage(page - 1)} disabled={page === 1}
              aria-label="Предыдущая страница" title="Предыдущая страница">
        <IconChevronLeft />
      </button>

      {numbers.map((number) => (
        <button
          key={number}
          className="btn-tool pagination__number"
          type="button"
          onClick={() => onPage(number)}
          aria-pressed={number === page}
          aria-current={number === page ? 'page' : undefined}
        >
          {number}
        </button>
      ))}

      <button className="btn-tool" type="button" onClick={() => onPage(page + 1)} disabled={page === count}
              aria-label="Следующая страница" title="Следующая страница">
        <IconChevronRight />
      </button>
      <button className="btn-tool" type="button" onClick={() => onPage(count)} disabled={page === count}
              aria-label="Последняя страница" title="Последняя страница">
        <IconChevronsRight />
      </button>
    </nav>
  );
}
