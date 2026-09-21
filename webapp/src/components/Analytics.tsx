import { useEffect } from 'react';

const COUNTER_ID = 112860720;

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
  }
}

/** Вставляет тег счётчика — форма из кабинета Метрики, без изменений по сути. */
function loadCounter(): void {
  const w = window as unknown as Record<string, unknown>;

  w.ym = w.ym || function (this: unknown, ...args: unknown[]) {
    ((w.ym as { a?: unknown[] }).a = (w.ym as { a?: unknown[] }).a || []).push(args);
  };
  (w.ym as { l: number }).l = Date.now();

  const src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`;
  for (let j = 0; j < document.scripts.length; j += 1) {
    if (document.scripts[j].src === src) return;
  }

  const script = document.createElement('script');
  const anchor = document.getElementsByTagName('script')[0];
  script.async = true;
  script.src = src;
  anchor.parentNode?.insertBefore(script, anchor);
}

/**
 * Счётчик Яндекс.Метрики.
 *
 * Собираемая статистика обезличена, поэтому подключается всегда, тем же
 * необходимым куком, что и cookie_consent, — без баннера согласия. Выбор
 * в баннере на счётчик не влияет, он только решает, показывать ли сам
 * баннер повторно.
 *
 * Вебвизор (запись сеанса вместе с содержимым страницы) выключен на
 * доске и на странице входа по приглашению: там на экране настоящий
 * рисунок с доски, а не публичный текст сайта, и его не должен видеть
 * никто, кроме тех, кого туда впустил владелец доски. Решение проверяет
 * только адрес при первой загрузке — если человек перешёл на доску
 * внутри уже открытого приложения, не перезагружая страницу, счётчик
 * остаётся в том состоянии, в котором был инициализирован.
 */
export function Analytics(): null {
  useEffect(() => {
    if (window.ym) return;

    loadCounter();
    const onBoard = /^\/(boards|join)\//.test(location.pathname);

    (window as unknown as Record<string, (...args: unknown[]) => void>).ym(COUNTER_ID, 'init', {
      ssr: true,
      webvisor: !onBoard,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });
  }, []);

  return null;
}
