import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Board } from '../api/types';
import { Page } from '../components/Layout';
import { Menu } from '../components/Menu';
import { Modal } from '../components/Modal';
import { IconEditor, IconOwner, IconViewer } from '../components/Icons';

export function BoardsPage(): ReactElement {
  const [boards, setBoards] = useState<Board[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /** Доска, которую переименовываем. */
  const [renaming, setRenaming] = useState<Board | null>(null);
  const [newTitle, setNewTitle] = useState('');

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

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;

    try {
      await api(`/boards/${renaming.id}`, { method: 'PATCH', body: { title: newTitle } });
      setRenaming(null);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось переименовать.');
    }
  };

  const remove = async (board: Board) => {
    if (!window.confirm(`Удалить доску «${board.title}»? Она пропадёт у всех участников.`)) return;

    try {
      await api(`/boards/${board.id}`, { method: 'DELETE' });
      setBoards((current) => current.filter((item) => item.id !== board.id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить доску.');
    }
  };

  return (
    <Page>
      <div className="page-header">
        <h1>Мои доски</h1>
      </div>

      <form className="card" onSubmit={create}>
        <div className="field">
          <label htmlFor="title">Новая доска</label>
          <div className="link-box">
            <input id="title" type="text" required maxLength={200}
                   placeholder="Например: Алгебра, 9 класс"
                   value={title} onChange={(event) => setTitle(event.target.value)} />
            <button className="btn-primary" type="submit" disabled={busy}>Создать</button>
          </div>
        </div>
      </form>

      {error ? <p className="note note-danger">{error}</p> : null}

      {loading ? (
        <p className="text-muted">Загружаем…</p>
      ) : boards.length === 0 ? (
        <p className="empty">
          Досок пока нет. Создайте первую — ссылка на неё появится сразу,
          останется только отправить её тем, кого ждёте на занятии.
        </p>
      ) : (
        <ul className="board-list">
          {boards.map((board) => (
            <li className="board-item" key={board.id}>
              <span className="people__icon" title={roleTitle(board.role)}>
                <RoleIcon role={board.role} />
              </span>

              <Link className="board-item__title" to={`/boards/${board.id}`}>{board.title}</Link>

              {board.locked ? <span className="badge badge-warning">закрыта</span> : null}

              {board.canManage ? (
                <Menu label="Действия с доской">
                  <button
                    className="btn-quiet menu__item"
                    type="button"
                    onClick={() => { setRenaming(board); setNewTitle(board.title); }}
                  >
                    Переименовать
                  </button>
                  <button
                    className="btn-quiet menu__item menu__item--danger"
                    type="button"
                    onClick={() => remove(board)}
                  >
                    Удалить
                  </button>
                </Menu>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {renaming ? (
        <Modal title="Переименовать доску" onClose={() => setRenaming(null)}>
          <form onSubmit={rename}>
            <div className="field">
              <label htmlFor="newTitle">Название</label>
              <input id="newTitle" type="text" required maxLength={200} autoFocus
                     value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
            </div>
            <button className="btn-primary btn-block" type="submit">Сохранить</button>
          </form>
        </Modal>
      ) : null}
    </Page>
  );
}

function RoleIcon({ role }: { role: Board['role'] }): ReactElement {
  if (role === 'owner') return <IconOwner />;
  if (role === 'editor') return <IconEditor />;
  return <IconViewer />;
}

function roleTitle(role: Board['role']): string {
  if (role === 'owner') return 'Ваша доска';
  if (role === 'editor') return 'Вы можете работать на доске';
  return 'Вы можете только смотреть';
}
