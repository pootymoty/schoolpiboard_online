import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { api, ApiError } from '../api/client';
import type { ActiveGuest, BoardMember, BoardRole, WaitingRequest } from '../api/types';
import {
  IconCheck, IconChevronLeft, IconChevronRight, IconClose,
  IconEditor, IconGuest, IconOwner, IconViewer,
} from './Icons';
import { Menu } from './Menu';

/** Как часто владелец проверяет, не постучался ли кто-то новый. */
const POLL_MS = 4000;

/** Страницами по столько — иначе длинный список раздувает панель бесконечно. */
const PAGE_SIZE = 5;

interface Props {
  boardId: number;
  canManage: boolean;
  members: BoardMember[];
  /** Другие гости на доске прямо сейчас — сам зашедший в этот список не входит. */
  guests: ActiveGuest[];
  /** Гость на доске — он в базе не хранится, поэтому приходит отдельно. */
  guestName?: string | null;
  onChanged: () => void;
  /** Сколько человек в очереди — родителю нужно для значка на своей кнопке. */
  onWaitingCount?: (count: number) => void;
}

/**
 * Участники доски и очередь ожидания.
 *
 * Ожидающих видит только владелец: остальным знать, кто ещё не впущен,
 * незачем.
 */
export function PeoplePanel({ boardId, canManage, members, guests, guestName, onChanged, onWaitingCount }: Props): ReactElement {
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const loadWaiting = useCallback(async () => {
    if (!canManage) return;

    try {
      const rows = await api<WaitingRequest[]>(`/boards/${boardId}/waiting`);
      setWaiting(rows);
      onWaitingCount?.(rows.length);
    } catch {
      // Очередь — не главное на странице: молчим и пробуем снова.
    }
  }, [boardId, canManage, onWaitingCount]);

  useEffect(() => {
    if (!canManage) return;

    void loadWaiting();
    const timer = window.setInterval(loadWaiting, POLL_MS);
    return () => window.clearInterval(timer);
  }, [canManage, loadWaiting]);

  const admit = async (requestId: string, role: BoardRole) => {
    try {
      await api(`/boards/${boardId}/waiting/admit`, { method: 'POST', body: { requestId, role } });
      setWaiting((current) => {
        const next = current.filter((item) => item.requestId !== requestId);
        onWaitingCount?.(next.length);
        return next;
      });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось впустить.');
    }
  };

  const reject = async (requestId: string) => {
    try {
      await api(`/boards/${boardId}/waiting/reject`, { method: 'POST', body: { requestId } });
      setWaiting((current) => {
        const next = current.filter((item) => item.requestId !== requestId);
        onWaitingCount?.(next.length);
        return next;
      });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отклонить.');
    }
  };

  const changeRole = async (userId: number, role: BoardRole) => {
    try {
      await api(`/boards/${boardId}/members/${userId}`, { method: 'PATCH', body: { role } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить роль.');
    }
  };

  const removeMember = async (userId: number, name: string) => {
    if (!window.confirm(`Убрать ${name} с доски?`)) return;

    try {
      await api(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось убрать участника.');
    }
  };

  const removeGuest = async (guestId: string, name: string) => {
    if (!window.confirm(`Убрать ${name} с доски?`)) return;

    try {
      await api(`/boards/${boardId}/guests/remove`, { method: 'POST', body: { requestId: guestId } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось убрать гостя.');
    }
  };

  // Один общий список — участники с учётной записью, гости, и сам гость
  // собой — чтобы страницы листались по всем сразу, а не по каждой группе
  // отдельно.
  const memberRows = members.map((member) => (
    <li className="people__item" key={`m-${member.userId}`}>
      <span className="people__icon" title={roleTitle(member.role)}>
        <RoleIcon role={member.role} />
      </span>
      <span className="people__name">{member.displayName}</span>

      {canManage && member.role !== 'owner' ? (
        <Menu label={`Действия: ${member.displayName}`}>
          <button
            className="btn-quiet menu__item"
            type="button"
            onClick={() => changeRole(member.userId, member.role === 'editor' ? 'viewer' : 'editor')}
          >
            {member.role === 'editor' ? 'Сделать наблюдателем' : 'Сделать редактором'}
          </button>
          <button
            className="btn-quiet menu__item menu__item--danger"
            type="button"
            onClick={() => removeMember(member.userId, member.displayName)}
          >
            Убрать с доски
          </button>
        </Menu>
      ) : null}
    </li>
  ));

  const guestRows = guests.map((guest) => (
    <li className="people__item" key={`g-${guest.guestId}`}>
      <span className="people__icon" title="Гость: зашёл по ссылке, без учётной записи">
        <IconGuest />
      </span>
      <span className="people__name">{guest.displayName}</span>
      <span className="people__icon" title={roleTitle(guest.role)}>
        <RoleIcon role={guest.role} />
      </span>

      {canManage ? (
        <button
          className="btn-tool"
          type="button"
          onClick={() => removeGuest(guest.guestId, guest.displayName)}
          aria-label={`Убрать ${guest.displayName} с доски`}
          title="Убрать с доски"
        >
          <IconClose size={16} />
        </button>
      ) : null}
    </li>
  ));

  // Гость виден самому себе: в списке участников его нет, а понимать, под
  // каким именем он подписан, ему нужно.
  const selfRow = guestName ? (
    <li className="people__item" key="self">
      <span className="people__icon" title="Вы зашли по ссылке, без учётной записи">
        <IconGuest />
      </span>
      <span className="people__name">{guestName} — это вы</span>
    </li>
  ) : null;

  const allRows = [...memberRows, ...guestRows, ...(selfRow ? [selfRow] : [])];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = allRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      {error ? <p className="note note-danger">{error}</p> : null}

      {canManage && waiting.length > 0 ? (
        <>
          <p className="people__group">Просятся на доску</p>
          <ul className="people">
            {waiting.map((request) => (
              <li className="people__item people__item--waiting" key={request.requestId}>
                <span className="people__icon">
                  {request.isGuest ? <IconGuest /> : <IconViewer />}
                </span>
                <span className="people__name">{request.displayName}</span>

                <button
                  className="btn-primary btn-sm"
                  type="button"
                  onClick={() => admit(request.requestId, 'editor')}
                  title="Впустить с правом рисовать"
                >
                  <IconCheck size={16} /> Редактор
                </button>

                <button
                  className="btn-quiet btn-sm"
                  type="button"
                  onClick={() => admit(request.requestId, 'viewer')}
                  title="Впустить только смотреть"
                >
                  Наблюдатель
                </button>

                <button
                  className="btn-tool"
                  type="button"
                  onClick={() => reject(request.requestId)}
                  aria-label="Отклонить"
                >
                  <IconClose size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="people__group">На доске · {allRows.length}</p>
      <ul className="people">{pageRows}</ul>

      {totalPages > 1 ? (
        <div className="people__pager">
          <button
            className="btn-tool"
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            aria-label="Предыдущая страница"
          >
            <IconChevronLeft size={16} />
          </button>
          <span className="text-muted small">{currentPage + 1} / {totalPages}</span>
          <button
            className="btn-tool"
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            aria-label="Следующая страница"
          >
            <IconChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RoleIcon({ role }: { role: BoardRole }): ReactElement {
  if (role === 'owner') return <IconOwner />;
  if (role === 'editor') return <IconEditor />;
  return <IconViewer />;
}

function roleTitle(role: BoardRole): string {
  if (role === 'owner') return 'Владелец доски';
  if (role === 'editor') return 'Может рисовать';
  return 'Только смотрит';
}
