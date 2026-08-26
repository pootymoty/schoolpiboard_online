import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { readGuestMarker, writeGuestMarker, writeGuestToken } from '../api/guest';
import type { JoinResult } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

/** Как часто спрашиваем, впустили ли нас. */
const POLL_MS = 3000;

/**
 * Страница ссылки: /join/{token}.
 *
 * Войти можно без регистрации: обучающемуся достаточно назвать имя.
 * Требовать от него учётную запись означало бы начинать каждое занятие
 * с технической возни.
 *
 * Дальше человек попадает в комнату ожидания, пока преподаватель не решит,
 * впускать ли его и с какой ролью. Роль назначается при приёме, а не зашита
 * в ссылку: одна ссылка на доску, и раздаётся она не глядя.
 */
export function JoinPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [boardTitle, setBoardTitle] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Что за доска — показываем до входа: человек должен понимать, куда его
  // зовут, прежде чем называть имя или регистрироваться.
  useEffect(() => {
    if (!token) return;

    api<{ boardTitle: string }>(`/join/${token}`)
      .then((info) => setBoardTitle(info.boardTitle))
      .catch((reason: unknown) => {
        setError(reason instanceof ApiError ? reason.message : 'Ссылка недействительна.');
      });
  }, [token]);

  /** Впустили — сохраняем и уходим на доску. */
  const enter = useCallback(
    (outcome: JoinResult) => {
      if (outcome.guestId) writeGuestMarker(outcome.guestId);
      if (outcome.guestToken) writeGuestToken(outcome.boardId, outcome.guestToken);
      navigate(`/boards/${outcome.boardId}`, { replace: true });
    },
    [navigate],
  );

  const request = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!token) return;

    setBusy(true);
    setError(null);

    try {
      const outcome = user
        ? await api<JoinResult>(`/join/${token}/user`, { method: 'POST' })
        : await api<JoinResult>(`/join/${token}/guest`, {
            method: 'POST',
            // Метку браузера присылаем обратно: по ней владелец узнаёт нас
            // между заходами, и повторно принимать в течение 15 минут
            // не приходится.
            body: { displayName: name, guestId: readGuestMarker() },
          });

      if (outcome.status === 'admitted') {
        enter(outcome);
        return;
      }

      setResult(outcome);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось попроситься на доску.');
    } finally {
      setBusy(false);
    }
  };

  // Пока ждём решения — спрашиваем сервер. Это опрос, а не живое соединение:
  // хаб появится вместе с холстом, тогда ожидание станет мгновенным.
  const waiting = result?.status === 'waiting';

  useEffect(() => {
    if (!waiting || !token || !result?.guestId) return;

    let stopped = false;

    const tick = async () => {
      try {
        const outcome = await api<JoinResult>(`/join/${token}/check`, {
          method: 'POST',
          body: { guestId: result.guestId, displayName: name },
        });

        if (stopped) return;

        if (outcome.status === 'admitted') {
          enter(outcome);
        } else if (outcome.status !== 'waiting') {
          setResult(outcome);
        }
      } catch {
        // Сеть моргнула — следующая попытка через три секунды.
      }
    };

    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [waiting, token, result, name, enter]);

  if (error && !boardTitle) {
    return (
      <Page narrow>
        <div className="card">
          <h1>Приглашение на доску</h1>
          <p className="note note-danger">{error}</p>
          <p className="text-muted small">
            Возможно, ссылку перевыпустили. Попросите новую у того, кто вас позвал.
          </p>
        </div>
      </Page>
    );
  }

  // Ждём решения преподавателя.
  if (result?.status === 'waiting') {
    return (
      <Page narrow>
        <div className="card waiting">
          <h1>Ждём преподавателя</h1>
          <p>
            Вы попросились на доску «{result.boardTitle}». Как только вас
            впустят, доска откроется сама.
          </p>
          <div className="waiting__dots" aria-hidden="true">
            <span /><span /><span />
          </div>
          <p className="text-muted small" style={{ marginTop: 'var(--sp-5)' }}>
            Страницу можно не обновлять — она сама следит за ответом.
          </p>
        </div>
      </Page>
    );
  }

  if (result?.status === 'rejected' || result?.status === 'locked') {
    return (
      <Page narrow>
        <div className="card">
          <h1>{result.status === 'locked' ? 'Доска закрыта' : 'Вас не впустили'}</h1>
          <p className="note note-warning">{result.message}</p>
          <button className="btn-primary" type="button" onClick={() => { setResult(null); }}>
            Попроситься ещё раз
          </button>
        </div>
      </Page>
    );
  }

  return (
    <Page narrow>
      <div className="card">
        <h1>Приглашение на доску</h1>

        {boardTitle ? (
          <p>Вас зовут на доску «{boardTitle}».</p>
        ) : (
          <p className="text-muted">Загружаем…</p>
        )}

        {error ? <p className="note note-danger">{error}</p> : null}

        {loading || !boardTitle ? null : user ? (
          <>
            <p className="text-muted">
              Вы вошли как {user.displayName}. Доска останется в вашем списке —
              и роль сохранится, второй раз проситься не придётся.
            </p>
            <button className="btn-primary" type="button" onClick={() => request()} disabled={busy}>
              {busy ? 'Отправляем…' : 'Попроситься на доску'}
            </button>
          </>
        ) : (
          <>
            <form onSubmit={request}>
              <div className="field">
                <label htmlFor="name">Как вас зовут</label>
                <input id="name" type="text" required maxLength={60} autoFocus
                       placeholder="Имя увидят другие на доске"
                       value={name} onChange={(event) => setName(event.target.value)} />
              </div>

              <button className="btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? 'Отправляем…' : 'Войти на доску'}
              </button>
            </form>

            <p className="text-muted small">
              Регистрироваться не нужно. Имя нужно только чтобы вас узнавали
              на доске — оно нигде не сохраняется.
            </p>

            <p className="text-muted small">
              Если у вас есть учётная запись,{' '}
              <Link to={`/login?next=/join/${token ?? ''}`}>войдите</Link> — тогда
              доска сохранится у вас в списке.
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
