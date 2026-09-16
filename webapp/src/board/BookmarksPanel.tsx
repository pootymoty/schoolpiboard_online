import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { listBookmarks } from '../api/bookmarks';
import type { Bookmark } from '../api/bookmarks';
import { ApiError } from '../api/client';

interface Props {
  boardId: number;
  /** Растёт при добавлении и удалении закладки — повод перечитать список. */
  version: number;
  onOpen: (bookmark: Bookmark) => void;
  onClose: () => void;
}

/**
 * Список закладок доски.
 *
 * Закладка — обычный объект холста, поставленный инструментом «Закладка»:
 * сама панель ничего не создаёт и не правит, только показывает, что уже
 * поставлено, и переносит к нему вид. Убрать закладку можно так же, как
 * любой другой объект, — выделив её на холсте.
 */
export function BookmarksPanel({ boardId, version, onOpen, onClose }: Props): ReactElement {
  const [list, setList] = useState<Bookmark[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    listBookmarks(boardId)
      .then((rows) => alive && setList(rows))
      .catch((reason) => {
        if (!alive) return;
        setList([]);
        setNote(reason instanceof ApiError ? reason.message : 'Не удалось прочитать закладки.');
      });

    return () => {
      alive = false;
    };
  }, [boardId, version]);

  return (
    <div className="params params--right params--tall" role="dialog" aria-label="Закладки">
      <div className="params__head">
        <span className="params__title">Закладки</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      <p className="library__hint">
        Инструмент «Закладка» на панели слева ставит подписанную метку в
        нужном месте. Список — по всей доске, не только по открытой странице.
      </p>

      {note ? <p className="library__hint library__note">{note}</p> : null}

      {list === null ? <p className="library__hint">Читаем…</p> : null}

      {list !== null && list.length === 0 ? (
        <p className="library__hint">Пока пусто.</p>
      ) : null}

      <div className="library__list">
        {(list ?? []).map((bookmark) => (
          <button
            key={bookmark.id}
            className="btn-quiet library__pick"
            type="button"
            onClick={() => onOpen(bookmark)}
          >
            {bookmark.data.text || 'Без названия'}
            <span className="library__count">{bookmark.pageTitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
