import type { ReactElement } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorView } from '../components/ErrorView';
import { canGoBack } from '../components/backNav';
import { Page } from '../components/Layout';

/**
 * Адреса нет.
 *
 * Раньше неизвестный адрес молча перекидывал на главную, и человек,
 * пришедший по опечатанной или устаревшей ссылке, не понимал, куда
 * делось то, за чем он шёл. Поисковику nginx отдаёт здесь честный 404
 * (см. deploy/nginx-board.conf), а человеку — эту страницу.
 */
export function NotFoundPage(): ReactElement {
  const { user } = useAuth();
  const { key } = useLocation();
  const navigate = useNavigate();
  const back = canGoBack(key);

  return (
    <Page narrow>
      <ErrorView
        code="404"
        title="Такой страницы нет"
        actions={(
          <>
            {/* Пришли переходом по сайту — назад, туда, откуда пришли.
                Пришли со стороны (поиск, чужая ссылка) — назад некуда,
                поэтому главной кнопкой становится «На главную». */}
            {back ? (
              <button className="btn btn-primary" type="button" onClick={() => navigate(-1)}>
                Вернуться назад
              </button>
            ) : null}
            <Link className={back ? 'btn btn-quiet' : 'btn btn-primary'} to="/">На главную страницу</Link>
            {user ? <Link className="btn btn-quiet" to="/boards">Мои доски</Link> : null}
          </>
        )}
      >
        <p>
          Возможно, в адресе опечатка или ссылка устарела. Если вы шли на доску по
          ссылке — попросите новую у того, кто вас позвал: её могли перевыпустить.
        </p>
      </ErrorView>
    </Page>
  );
}
