import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Board } from '../api/types';
import { Page } from '../components/Layout';
import { Menu } from '../components/Menu';
import { Modal } from '../components/Modal';
import { IconArrowDown, IconArrowUp, IconEditor, IconOwner, IconPeople, IconViewer } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { reachGoal } from '../components/Analytics';
import { BOARD_TITLE_HINT, BOARD_TITLE_MAX, cleanBoardTitle } from '../boardTitle';

/** Досок на одной странице списка. */
const PAGE_SIZE = 10;

type SortKey = 'title' | 'createdAt' | 'updatedAt';

/**
 * Порядок столбца: `natural` — обычный для него (даты — от новых к
 * старым, название — от А до Я), стрелка вниз; `reversed` — обратный,
 * стрелка вверх.
 */
type SortDirection = 'natural' | 'reversed';

interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/** По умолчанию — сначала те, где работали последними. */
const DEFAULT_SORT: Sort = { key: 'updatedAt', direction: 'natural' };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Название' },
  { key: 'createdAt', label: 'Создана' },
  { key: 'updatedAt', label: 'Изменена' },
];

export function BoardsPage(): ReactElement {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Окно создания доски: открыто ли, что в поле, идёт ли запрос. */
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
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

  // Кто сейчас на доске — то же самое живое присутствие, что видно на
  // самой доске, а не отдельная метка. Опрос, а не подписка на хаб: с
  // десятком досок в списке держать столько же соединений ради счётчика
  // было бы дороже, чем раз в пять секунд перечитать список целиком.
  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openCreate = () => {
    setTitle('');
    setCreateError(null);
    setCreating(true);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      const board = await api<Board>('/boards', { method: 'POST', body: { title: title.trim() } });
      reachGoal('board_create');
      // Сразу на доску, с открытой ссылкой: обещание с пустого экрана —
      // «ссылка появится сразу» — должно выполняться буквально, без
      // дополнительных кликов «открыть доску → найти иконку ссылки».
      navigate(`/boards/${board.id}`, { state: { openLink: true } });
    } catch (reason) {
      setCreateError(reason instanceof ApiError ? reason.message : 'Не удалось создать доску.');
      setBusy(false);
    }
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;

    try {
      await api(`/boards/${renaming.id}`, { method: 'PATCH', body: { title: newTitle.trim() } });
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

  // Щелчок по уже выбранному столбцу переворачивает порядок, по другому —
  // выбирает его в обычном для него порядке.
  const sortBy = (key: SortKey) => {
    setSort((current) => (
      current.key === key
        ? { key, direction: current.direction === 'natural' ? 'reversed' : 'natural' }
        : { key, direction: 'natural' }
    ));
    setPage(1);
  };

  const search = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  // Список приходит целиком, без страниц — поиск, порядок и страницы
  // считаются на месте, без похода на сервер: досок у одного человека
  // десятки, не тысячи. Страницы режут уже найденное и упорядоченное —
  // поэтому они всегда про то, что сейчас на экране.
  const needle = query.trim().toLowerCase();

  const found = useMemo(() => {
    const matched = needle
      ? boards
        .map((board) => ({
          board,
          titleHit: board.title.toLowerCase().includes(needle),
          bookmarkHits: board.bookmarks.filter((text) => text.toLowerCase().includes(needle)),
        }))
        .filter((row) => row.titleHit || row.bookmarkHits.length > 0)
      : boards.map((board) => ({ board, titleHit: false, bookmarkHits: [] as string[] }));

    return [...matched].sort((a, b) => compare(a.board, b.board, sort));
  }, [boards, needle, sort]);

  const pageCount = Math.max(1, Math.ceil(found.length / PAGE_SIZE));

  // Доску удалили или опрос принёс список короче — страница, на которой
  // стояли, могла кончиться.
  const current = Math.min(page, pageCount);
  const visible = found.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <Page>
      <div className="page-header">
        <h1>Мои доски</h1>
        <button className="btn-primary" type="button" onClick={openCreate}>Создать доску</button>
      </div>

      {error ? <p className="note note-danger">{error}</p> : null}

      {!loading && boards.length > 0 ? (
        <input
          className="input boards-search"
          type="search"
          value={query}
          placeholder="Найти доску по названию или закладке"
          onChange={(event) => search(event.target.value)}
          aria-label="Найти доску по названию или закладке"
        />
      ) : null}

      {loading ? null : boards.length === 0 ? (
        <p className="empty">
          Досок пока нет.
        </p>
      ) : found.length === 0 ? (
        <p className="empty">
          Ничего не найдено по «{query.trim()}».
        </p>
      ) : (
        <>
          <div className="board-list">
            {/* Заголовки столбцов — они же переключатели порядка. Стрелка
                у каждого: вниз — обычный порядок, вверх — обратный; у
                выбранного сейчас она яркая, у остальных бледная. */}
            <div className="board-list__head" role="group" aria-label="Порядок досок">
              <span className="board-list__icon-col" aria-hidden="true" />
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                const reversed = active && sort.direction === 'reversed';

                return (
                  <button
                    key={column.key}
                    type="button"
                    className={`board-list__sort board-list__sort--${column.key}${active ? ' board-list__sort--active' : ''}`}
                    onClick={() => sortBy(column.key)}
                    aria-pressed={active}
                    title={sortTitle(column.key, active ? sort.direction : 'natural')}
                  >
                    <span>{column.label}</span>
                    {reversed ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                  </button>
                );
              })}
              <span className="board-list__tail-col" aria-hidden="true" />
            </div>

            <ul className="board-list__rows">
              {visible.map(({ board, bookmarkHits }) => (
                <li className="board-item" key={board.id}>
                  <span className="people__icon board-item__icon" title={roleTitle(board.role)}>
                    <RoleIcon role={board.role} />
                  </span>

                  <div className="board-item__main">
                    <div className="board-item__name">
                      <Link className="board-item__title" to={`/boards/${board.id}`}>{board.title}</Link>
                      {board.locked ? <span className="badge badge-warning">закрыта</span> : null}
                    </div>

                    {/* Нашлась по закладке — показываем по какой: иначе
                        непонятно, почему доска с другим названием в выдаче. */}
                    {bookmarkHits.length > 0 ? (
                      <p className="board-item__hits">
                        Закладки: {bookmarkHits.join(', ')}
                      </p>
                    ) : null}
                  </div>

                  <span className="board-item__date board-item__date--created">
                    <span className="board-item__date-label">Создана </span>
                    {formatDate(board.createdAt)}
                  </span>

                  <span className="board-item__date board-item__date--updated">
                    <span className="board-item__date-label">Изменена </span>
                    {formatDate(board.updatedAt)}
                  </span>

                  <span className="board-item__tail">
                    {board.activeCount > 0 ? (
                      <span className="board-item__active" title={`Сейчас на доске: ${board.activeCount}`}>
                        <IconPeople size={14} />
                        {board.activeCount}
                      </span>
                    ) : null}

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
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {found.length > PAGE_SIZE ? (
            <Pagination page={current} count={pageCount} onPage={setPage} label="Страницы списка досок" />
          ) : null}
        </>
      )}

      {creating ? (
        <Modal title="Новая доска" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="title">Название</label>
              <input id="title" type="text" required maxLength={BOARD_TITLE_MAX} autoFocus placeholder="Имя доски"
                     aria-describedby="titleHint"
                     value={title} onChange={(event) => setTitle(cleanBoardTitle(event.target.value))} />
              <p className="field__hint" id="titleHint">{BOARD_TITLE_HINT}</p>
            </div>

            {createError ? <p className="note note-danger">{createError}</p> : null}

            <div className="row modal__actions">
              <button className="btn-primary" type="submit" disabled={busy}>Создать</button>
              <button className="btn" type="button" onClick={() => setCreating(false)}>Отмена</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {renaming ? (
        <Modal title="Переименовать доску" onClose={() => setRenaming(null)}>
          <form onSubmit={rename}>
            <div className="field">
              <label htmlFor="newTitle">Название</label>
              <input id="newTitle" type="text" required maxLength={BOARD_TITLE_MAX} autoFocus
                     aria-describedby="newTitleHint"
                     value={newTitle} onChange={(event) => setNewTitle(cleanBoardTitle(event.target.value))} />
              <p className="field__hint" id="newTitleHint">{BOARD_TITLE_HINT}</p>
            </div>
            <button className="btn-primary btn-block" type="submit">Сохранить</button>
          </form>
        </Modal>
      ) : null}
    </Page>
  );
}

/** Сравнение досок для выбранного порядка. Равные — по номеру, чтобы строки не прыгали между опросами. */
function compare(a: Board, b: Board, sort: Sort): number {
  let result: number;

  if (sort.key === 'title') {
    result = a.title.localeCompare(b.title, 'ru', { sensitivity: 'base', numeric: true });
  } else {
    // Даты в обычном порядке — от новых к старым.
    result = Date.parse(b[sort.key]) - Date.parse(a[sort.key]);
  }

  if (sort.direction === 'reversed') result = -result;
  return result !== 0 ? result : b.id - a.id;
}

function sortTitle(key: SortKey, direction: SortDirection): string {
  if (key === 'title') return direction === 'natural' ? 'По названию: от А до Я' : 'По названию: от Я до А';
  return direction === 'natural' ? 'Сначала новые' : 'Сначала старые';
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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
