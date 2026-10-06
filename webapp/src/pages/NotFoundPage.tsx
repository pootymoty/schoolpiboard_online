import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorView } from '../components/ErrorView';
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

  return (
    <Page narrow>
      <ErrorView
        code="404"
        title="Такой страницы нет"
        actions={(
          <>
            {user ? (
              <Link className="btn btn-primary" to="/boards">Мои доски</Link>
            ) : (
              <Link className="btn btn-primary" to="/">На главную</Link>
            )}
            <Link className="btn btn-quiet" to="/faq">Частые вопросы</Link>
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
