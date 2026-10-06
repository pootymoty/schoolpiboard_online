import type { ReactElement, ReactNode } from 'react';

/**
 * Карточка ошибки: крупный код, что случилось и куда пойти дальше.
 * Общая для «нет такой страницы» и «что-то сломалось» — чтобы обе
 * выглядели как часть сайта, а не как служебное сообщение браузера.
 */
export function ErrorView({ code, title, children, actions }: {
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}): ReactElement {
  return (
    <section className="card error-view">
      <p className="error-view__code" aria-hidden="true">{code}</p>
      <h1>{title}</h1>
      <div className="error-view__text">{children}</div>
      <div className="row error-view__actions">{actions}</div>
    </section>
  );
}
