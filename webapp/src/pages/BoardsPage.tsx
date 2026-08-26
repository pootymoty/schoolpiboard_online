import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Board } from '../api/types';
import { Page } from '../components/Layout';

export function BoardsPage(): ReactElement {
  const [boards, setBoards] = useState<Board[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoards(await api<Board[]>('/boards'));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить доски.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      const board = await api<Board>('/boards', { method: 'POST', body: { title } });
      setBoards((current) => [board, ...current]);
      setTitle('');
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось создать доску.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <h1>Мои доски</h1>
      </div>

      <form className="card create-form" onSubmit={create}>
        <label htmlFor="title">Новая доска</label>
        <div className="form-inline">
          <input id="title" type="text" required maxLength={200}
                 placeholder="Например: Алгебра, 9 класс"
                 value={title} onChange={(event) => setTitle(event.target.value)} />
          <button className="btn-primary" type="submit" disabled={busy}>Создать</button>
        </div>
      </form>

      {error ? <p className="note note-danger">{error}</p> : null}

      {loading ? (
        <p className="text-muted">Загружаем…</p>
      ) : boards.length === 0 ? (
        <p className="text-muted">
          Досок пока нет. Создайте первую — потом дадите на неё ссылку тем,
          кого ждёте на занятии.
        </p>
      ) : (
        <ul className="board-list">
          {boards.map((board) => (
            <li className="board-row" key={board.id}>
              <Link className="board-name" to={`/boards/${board.id}`}>{board.title}</Link>

              <span className="row">
                {board.role !== 'owner' ? (
                  <span className="badge" title="Вы вошли по ссылке">🔗 чужая</span>
                ) : null}
                {board.locked ? <span className="badge" title="Новых не впускать">🔒 закрыта</span> : null}
                <span className={`badge badge-${board.role}`}>{roleTitle(board.role)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function roleTitle(role: Board['role']): string {
  if (role === 'owner') return 'владелец';
  if (role === 'editor') return 'работает';
  return 'смотрит';
}
