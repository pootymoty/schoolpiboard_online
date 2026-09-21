import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { COOKIE_CONSENT_URL, readCookieConsent } from '../api/cookieConsent';
import type { CookieConsent } from '../api/cookieConsent';

/**
 * Баннер согласия на куки.
 *
 * Кнопки — обычная HTML-форма с обычной отправкой, не `fetch`: адрес
 * ниже отвечает редиректом на ту же страницу, поэтому выбор сохраняется,
 * даже если скрипт приложения не выполнился. React здесь только решает,
 * показывать баннер или нет, и делает это не через `document.cookie`
 * (кука HttpOnly, со страницы её не прочитать), а спрашивая сервер.
 *
 * `undefined` — ответ ещё не пришёл, ничего не показываем: баннер не
 * должен мигать поверх страницы, пока идёт первый запрос.
 */
export function CookieBanner(): ReactElement | null {
  const [consent, setConsent] = useState<CookieConsent | null | undefined>(undefined);
  const location = useLocation();
  const firstButton = useRef<HTMLButtonElement>(null);

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

      <form className="cookie-banner__actions" method="POST" action={COOKIE_CONSENT_URL}>
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
