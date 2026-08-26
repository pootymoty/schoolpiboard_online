import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { readGuestToken, writeGuestToken } from '../api/guest';
import type { BoardState } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';
import { LinksPanel } from '../components/LinksPanel';
import { MembersPanel } from '../components/MembersPanel';

/**
 * Страница доски. Открывается и участником с учётной записью, и гостем:
 * состояние приходит одним запросом, а кто именно смотрит — решает сервер.
 */
export function BoardPage(): ReactElement {
  const { boardId } = useParams<{ boardId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const id = Number(boardId);

  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<BoardState>(`/boards/${id}/state`, { guestToken: readGuestToken(id) }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть доску.');
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  const toggleLock = async () => {
    if (!state) return;
    setBusy(true);

    try {
      await api(`/boards/${id}/lock`, { method: 'POST', body: { locked: !state.board.locked } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить замок.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Удалить доску? Она пропадёт у всех участников.')) return;
    setBusy(true);

    try {
      await api(`/boards/${id}`, { method: 'DELETE' });
      navigate('/boards', { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить доску.');
      setBusy(false);
    }
  };

  const leaveGuest = () => {
    writeGuestToken(id, null);
    navigate('/', { replace: true });
  };

  if (error && !state) {
    return (
      <Page>
        <div className="card form">
          <h1>Доска</h1>
          <p className="error">{error}</p>
          <p className="muted small">
            Возможно, вас удалили с доски или закрыли доступ. Если вы заходили
            по ссылке, попросите новую.
          </p>
        </div>
      </Page>
    );
  }

  if (!state) {
    return (
      <Page>
        <p className="muted">Загружаем доску…</p>
      </Page>
    );
  }

  const { board, me } = state;

  return (
    <Page wide>
      <div className="page-header">
        <h1>{board.title}</h1>

        <div className="row">
          <span className={`badge badge-${board.role}`}>
            {board.role === 'owner' ? 'владелец' : board.canEdit ? 'работает' : 'смотрит'}
          </span>
          {board.locked ? <span className="badge">🔒 закрыта для новых</span> : null}
          {me.isGuest ? <span className="badge">гость: {me.displayName}</span> : null}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="card canvas-placeholder">
        <h2>Здесь появится холст</h2>
        <p className="muted">
          Рисование, фигуры и совместная работа — следующий этап. Сейчас
          готово всё вокруг холста: доступ, роли и ссылки.
        </p>
        {!board.canEdit ? (
          <p className="muted small">
            У вас доступ только на просмотр: рисовать вы не сможете, и сервер
            это проверяет — не только интерфейс.
          </p>
        ) : null}
      </section>

      {board.canManage ? (
        <>
          <LinksPanel boardId={id} />
          <MembersPanel boardId={id} />

          <section className="card panel danger-zone">
            <h2>Управление доской</h2>

            <div className="row">
              <button className="button ghost" type="button" onClick={toggleLock} disabled={busy}>
                {board.locked ? 'Впускать новых' : 'Не впускать новых'}
              </button>
              <button className="button ghost" type="button" onClick={remove} disabled={busy}>
                Удалить доску
              </button>
            </div>

            <p className="muted small">
              Замок не выгоняет тех, кто уже на доске, — он закрывает вход
              новым, даже по действующей ссылке.
            </p>
          </section>
        </>
      ) : null}

      {me.isGuest ? (
        <p className="muted small">
          Вы на доске как гость. Чтобы доска сохранилась у вас в списке,
          нужна учётная запись.{' '}
          <button className="button ghost" type="button" onClick={leaveGuest}>Выйти с доски</button>
        </p>
      ) : !user ? null : null}
    </Page>
  );
}
