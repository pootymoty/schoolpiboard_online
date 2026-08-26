import type { ReactElement } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

/**
 * Список досок появится на этапе 11b вместе с доступом по ссылке.
 * Пока страница подтверждает, что вход состоялся, и не притворяется,
 * будто доски уже есть.
 */
export function BoardsPage(): ReactElement {
  const { user } = useAuth();

  return (
    <Page>
      <div className="card form">
        <h1>Мои доски</h1>
        <p>Вы вошли как {user?.displayName} ({user?.email}).</p>
        <p className="muted">
          Создание досок и ссылки для обучающихся — следующий этап работы.
          Сейчас готово основание: учётные записи, подтверждение почты и вход.
        </p>
      </div>
    </Page>
  );
}
