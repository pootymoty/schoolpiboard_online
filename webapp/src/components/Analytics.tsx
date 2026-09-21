import { useEffect } from 'react';
import { readCookieConsent } from '../api/cookieConsent';

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
 * Ставит свои куки и пишет их только при выборе «Принять» в баннере
 * согласия — при «Отклонить» или до ответа сервера скрипт вообще не
 * загружается. Баннер отправляет выбор обычной формой с перезагрузкой
 * страницы, поэтому проверять его повторно при каждом переходе внутри
 * приложения не нужно: здесь достаточно одной проверки при загрузке.
 */
export function Analytics(): null {
  useEffect(() => {
    let alive = true;

    readCookieConsent().then((consent) => {
      if (!alive || consent !== 'all' || window.ym) return;

      loadCounter();
      (window as unknown as Record<string, (...args: unknown[]) => void>).ym(COUNTER_ID, 'init', {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: 'dataLayer',
        referrer: document.referrer,
        url: location.href,
        accurateTrackBounce: true,
        trackLinks: true,
      });
    }).catch(() => {
      // Сервер не ответил — счётчик просто не подключается, страница
      // при этом работает как обычно.
    });

    return () => {
      alive = false;
    };
  }, []);

  return null;
}
