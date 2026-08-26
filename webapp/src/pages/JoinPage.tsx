import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { readGuestMarker, writeGuestMarker, writeGuestToken } from '../api/guest';
import type { GuestSession, JoinInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

/**
 * Страница ссылки: /join/{token}.
 *
 * Главное здесь — войти можно **без регистрации**. Обучающемуся достаточно
 * назвать имя, чтобы остальные понимали, чей курсор на доске. Требовать от
 * него учётную запись означало бы начинать каждое занятие с технической
 * возни.
 */
export function JoinPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Что за доска — показываем и до входа: человек должен понимать, куда его
  // зовут, прежде чем называть имя или регистрироваться.
  useEffect(() => {
    if (!token) return;

    api<JoinInfo>(`/join/${token}`)
      .then(setInfo)
      .catch((reason: unknown) => {
        setError(reason instanceof ApiError ? reason.message : 'Ссылка недействительна.');
      });
  }, [token]);

  const joinAsGuest = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setBusy(true);
    setError(null);

    try {
      const session = await api<GuestSession>(`/join/${token}/guest`, {
        method: 'POST',
        // Метку браузера присылаем обратно: по ней владелец доски может
        // выгнать гостя на пятнадцать минут.
        body: { displayName: name, guestId: readGuestMarker() },
      });

      writeGuestMarker(session.guestId);
      writeGuestToken(session.boardId, session.guestToken);
      navigate(`/boards/${session.boardId}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось войти на доску.');
      setBusy(false);
    }
  };

  const joinAsUser = useCallback(async () => {
    if (!token) return;

    setBusy(true);
    try {
      const result = await api<{ boardId: number }>(`/join/${token}/user`, { method: 'POST' });
      navigate(`/boards/${result.boardId}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось войти на доску.');
      setBusy(false);
    }
  }, [token, navigate]);

  if (error && !info) {
    return (
      <Page>
        <div className="card">
          <h1>Приглашение на доску</h1>
          <p className="note note-danger">{error}</p>
          <p className="text-muted small">
            Возможно, ссылку отозвали или у неё истёк срок. Попросите новую
            у того, кто вас позвал.
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="card">
        <h1>Приглашение на доску</h1>

        {info ? (
          <p>
            Вас зовут на доску «{info.boardTitle}»
            {info.role === 'viewer' ? ' — смотреть, без права рисовать' : ''}.
          </p>
        ) : (
          <p className="text-muted">Загружаем…</p>
        )}

        {error ? <p className="note note-danger">{error}</p> : null}

        {loading || !info ? null : user ? (
          <>
            <p className="text-muted">
              Вы вошли как {user.displayName}. Доска появится в вашем списке —
              и останется там, даже если ссылку потом отзовут.
            </p>
            <button className="btn-primary" type="button" onClick={joinAsUser} disabled={busy}>
              {busy ? 'Открываем…' : 'Открыть доску'}
            </button>
          </>
        ) : (
          <>
            <form onSubmit={joinAsGuest}>
              <label htmlFor="name">Как вас зовут</label>
              <input id="name" type="text" required maxLength={60} autoFocus
                     placeholder="Имя увидят другие на доске"
                     value={name} onChange={(event) => setName(event.target.value)} />

              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? 'Входим…' : 'Войти на доску'}
              </button>
            </form>

            <p className="text-muted small">
              Регистрироваться не нужно. Имя нужно только чтобы вас узнавали
              на доске — оно нигде не сохраняется.
            </p>

            <p className="text-muted small">
              Если у вас есть учётная запись, <Link to={`/login?next=/join/${token ?? ''}`}>войдите</Link> —
              тогда доска останется в вашем списке.
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
