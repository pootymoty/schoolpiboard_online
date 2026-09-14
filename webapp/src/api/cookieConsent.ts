import { API_URL, api } from './client';

export type CookieConsent = 'all' | 'rejected';

/** Куда шлёт форму баннер — адрес строится так же, как и у остальных запросов. */
export const COOKIE_CONSENT_URL = `${API_URL}/cookie-consent`;

/**
 * Читает согласие. Сама кука — HttpOnly, страница её не видит: ответ
 * приходит только через этот запрос, который сервер собрал из куки сам.
 */
export function readCookieConsent(): Promise<CookieConsent | null> {
  return api<{ consent: CookieConsent | null }>('/cookie-consent').then((data) => data.consent);
}
