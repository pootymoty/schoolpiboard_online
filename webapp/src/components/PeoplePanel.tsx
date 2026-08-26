import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { api, ApiError } from '../api/client';
import type { BoardMember, BoardRole, WaitingRequest } from '../api/types';
import { IconCheck, IconClose, IconEditor, IconGuest, IconOwner, IconViewer } from './Icons';
import { Menu } from './Menu';

/** Как часто владелец проверяет, не постучался ли кто-то новый. */
const POLL_MS = 4000;

interface Props {
  boardId: number;
  canManage: boolean;
  members: BoardMember[];
  /** Гость на доске — он в базе не хранится, поэтому приходит отдельно. */
  guestName?: string | null;
  onChanged: () => void;
}

/**
 * Участники доски и очередь ожидания.
 *
 * Ожидающих видит только владелец: остальным знать, кто ещё не впущен,
 * незачем.
 */
export function PeoplePanel({ boardId, canManage, members, guestName, onChanged }: Props): ReactElement {
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadWaiting = useCallback(async () => {
    if (!canManage) return;

    try {
      setWaiting(await api<WaitingRequest[]>(`/boards/${boardId}/waiting`));
    } catch {
      // Очередь — не главное на странице: молчим и пробуем снова.
    }
  }, [boardId, canManage]);

  useEffect(() => {
    if (!canManage) return;

    void loadWaiting();
    const timer = window.setInterval(loadWaiting, POLL_MS);
    return () => window.clearInterval(timer);
  }, [canManage, loadWaiting]);

  const admit = async (requestId: string, role: BoardRole) => {
    try {
      await api(`/boards/${boardId}/waiting/admit`, { method: 'POST', body: { requestId, role } });
      setWaiting((current) => current.filter((item) => item.requestId !== requestId));
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось впустить.');
    }
  };

  const reject = async (requestId: string) => {
    try {
      await api(`/boards/${boardId}/waiting/reject`, { method: 'POST', body: { requestId } });
      setWaiting((current) => current.filter((item) => item.requestId !== requestId));
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

      <p className="people__group">На доске</p>
      <ul className="people">
        {members.map((member) => (
          <li className="people__item" key={member.userId}>
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
        ))}

        {/* Гость виден самому себе: в списке участников его нет, а понимать,
            под каким именем он подписан, ему нужно. */}
        {guestName ? (
          <li className="people__item">
            <span className="people__icon" title="Вы зашли по ссылке, без учётной записи">
              <IconGuest />
            </span>
            <span className="people__name">{guestName} — это вы</span>
          </li>
        ) : null}
      </ul>
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
