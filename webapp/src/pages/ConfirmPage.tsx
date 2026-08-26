import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

/** Страница из письма: подтверждает почту и сразу впускает. */
export function ConfirmPage(): ReactElement {
  const [params] = useSearchParams();
  const { accept } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // В строгом режиме React вызывает эффект дважды. Код одноразовый, поэтому
  // второй вызов получил бы отказ и показал бы ошибку на удачном подтверждении.
  const started = useRef(false);

  useEffect(() => {
    const token = params.get('token');

    if (!token) {
      setError('Ссылка неполная. Откройте её из письма целиком.');
      return;
    }

    if (started.current) return;
    started.current = true;

    api<AuthResponse>('/auth/confirm', { method: 'POST', body: { token } })
      .then((result) => {
        accept(result);
        setDone(true);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof ApiError ? reason.message : 'Не удалось подтвердить почту.');
      });
  }, [params, accept]);

  return (
    <Page>
      <div className="card">
        <h1>Подтверждение почты</h1>

        {done ? (
          <>
            <p>Почта подтверждена, вы вошли.</p>
            <Link className="btn-primary" to="/boards">К доскам</Link>
          </>
        ) : error ? (
          <>
            <p className="note note-danger">{error}</p>
            <p className="text-muted small">
              Ссылка действует сутки и срабатывает один раз. Если срок вышел,
              запросите новое письмо на странице входа.
            </p>
            <Link className="btn-primary" to="/login">На страницу входа</Link>
          </>
        ) : (
          <p className="text-muted">Подтверждаем…</p>
        )}
      </div>
    </Page>
  );
}
