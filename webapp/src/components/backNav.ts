/**
 * Есть ли куда вернуться кнопкой «Назад» — на страницу этого же сайта.
 *
 * Внутри приложения переходы не меняют document.referrer, поэтому
 * смотрим и на ключ адреса из роутера: у первой открытой страницы он
 * «default», у всех, куда пришли переходом по сайту, — свой. Пришли
 * со стороны (из поиска, по ссылке из мессенджера, набрали адрес) —
 * возвращаться некуда, и вместо «Назад» нужна «На главную».
 */
export function canGoBack(routerKey?: string): boolean {
  if (typeof window === 'undefined') return false;
  if (routerKey !== undefined && routerKey !== 'default') return true;

  try {
    return document.referrer !== '' && new URL(document.referrer).origin === window.location.origin
      && window.history.length > 1;
  } catch {
    return false;
  }
}
