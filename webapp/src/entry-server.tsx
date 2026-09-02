import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';

// Тот же список страниц, что и у приложения: сборщик кладёт SSR-код в один
// файл, и брать таблицу из отдельного модуля скрипту предрендера неоткуда.
export { PUBLIC_PAGES, SITE_URL } from './seo';

/**
 * Отрисовка страницы в готовый HTML при сборке.
 *
 * Нужна поисковику: у одностраничного приложения он видит пустой div и
 * один и тот же заголовок на всех адресах — то есть один документ вместо
 * десятка. Здесь же каждая страница уезжает в свой файл с собственным
 * заголовком, описанием и текстом.
 *
 * Отрисовывается вид неавторизованного: кто пришёл, на сборке неизвестно,
 * да и поисковику показывать чужой кабинет незачем. Браузер потом
 * перерисует страницу заново — гидратации нет намеренно, иначе пришлось
 * бы держать разметку сервера и клиента совпадающей до символа.
 */
export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StaticRouter>,
  );
}
