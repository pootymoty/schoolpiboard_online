import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { COOKIE_CONSENT_URL, readCookieConsent } from '../api/cookieConsent';
import type { CookieConsent } from '../api/cookieConsent';

/**
 * Баннер согласия на куки.
 *
 * Кнопки лежат в обычной HTML-форме с обычной отправкой — адрес ниже
 * отвечает редиректом на ту же страницу, поэтому без JavaScript, или
 * пока скрипт приложения не выполнился, выбор всё равно сохранится.
 * Здесь эта отправка перехватывается и заменяется на `fetch` с тем же
 * телом: кука проставляется тем же ответом сервера, а страница не
 * перезагружается — иначе на телефоне на секунду мигает пустой экран.
 * Если сеть подвела, форма отправляется как обычно, без перехвата.
 *
 * `undefined` — ответ ещё не пришёл, ничего не показываем: баннер не
 * должен мигать поверх страницы, пока идёт первый запрос.
 */
export function CookieBanner(): ReactElement | null {
  const [consent, setConsent] = useState<CookieConsent | null | undefined>(undefined);
  const location = useLocation();
  const firstButton = useRef<HTMLButtonElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const choice = (submitter?.value ?? 'rejected') as CookieConsent;

    try {
      const response = await fetch(COOKIE_CONSENT_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ choice, next: location.pathname }),
      });
      if (!response.ok) throw new Error('cookie-consent request failed');
      setConsent(choice);
    } catch {
      // Сеть подвела — доверяем обычной отправке формы, той же, что
      // работает без JavaScript вовсе.
      form.submit();
    }
  };

  useEffect(() => {
    let alive = true;
    readCookieConsent()
      .then((value) => alive && setConsent(value))
      .catch(() => alive && setConsent(null));
    return () => {
      alive = false;
    };
  }, []);

  // Постоянная кнопка в подвале не хранит ссылку на баннер сама — она
  // просто просит его открыться, а кто в этот момент смонтирован, решает
  // сам баннер. Так подвал и баннер остаются независимыми компонентами.
  useEffect(() => {
    const reopen = (): void => {
      setConsent(null);
      requestAnimationFrame(() => firstButton.current?.focus());
    };
    window.addEventListener('cookie-settings-reopen', reopen);
    return () => window.removeEventListener('cookie-settings-reopen', reopen);
  }, []);

  if (consent !== null) return null;

  return (
    <div className="cookie-banner" role="region" aria-label="Согласие на куки">
      <p className="cookie-banner__text">
        Сайт использует куки для корректной работы и обезличенную статистику
        посещений (Яндекс.Метрика). Подробнее — в{' '}
        <Link to="/legal/privacy">политике обработки персональных данных</Link>.
      </p>

      <form className="cookie-banner__actions" method="POST" action={COOKIE_CONSENT_URL} onSubmit={submit}>
        <input type="hidden" name="next" value={location.pathname} />
        <button ref={firstButton} className="btn btn-primary btn-sm" type="submit" name="choice" value="all">
          Принять
        </button>
        <button className="btn btn-quiet btn-sm" type="submit" name="choice" value="rejected">
          Отклонить
        </button>
      </form>
    </div>
  );
}
