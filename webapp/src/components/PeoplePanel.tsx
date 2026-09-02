import { useState } from 'react';
import type { ReactElement } from 'react';
import { api, ApiError } from '../api/client';
import type { ActiveGuest, BoardMember, BoardRole } from '../api/types';
import type { WaitingQueue } from '../board/useWaitingQueue';
import type { Cursor, Participant } from '../board/protocol';
import {
  IconCheck, IconChevronLeft, IconChevronRight, IconClose,
  IconEditor, IconGuest, IconOwner, IconViewer,
} from './Icons';
import { Menu } from './Menu';

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
  /** Очередь ожидания. Опрашивается страницей — панель может быть закрыта. */
  queue: WaitingQueue;
  /** Кто подключён прямо сейчас — это знает хаб, а не состав доски. */
  present: Participant[];
  /** Где чей курсор. Пусто у того, кто ещё не двигал указатель. */
  cursors: Cursor[];
  /** Перенести холст к курсору участника. */
  onGoTo: (connectionId: string) => void;
  /** Своё подключение: к себе прыгать незачем. */
  meConnectionId: string | null;
  onChanged: () => void;
}

/**
 * Участники доски и очередь ожидания.
 *
 * Ожидающих видит только владелец: остальным знать, кто ещё не впущен,
 * незачем.
 */
export function PeoplePanel({
  boardId, canManage, members, guests, guestName, queue,
  present, cursors, onGoTo, meConnectionId, onChanged,
}: Props): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const waiting = queue.waiting;

  const admit = async (requestId: string, role: BoardRole) => {
    try {
      await api(`/boards/${boardId}/waiting/admit`, { method: 'POST', body: { requestId, role } });
      queue.forget(requestId);
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось впустить.');
    }
  };

  const reject = async (requestId: string) => {
    try {
      await api(`/boards/${boardId}/waiting/reject`, { method: 'POST', body: { requestId } });
      queue.forget(requestId);
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

  const kickMember = async (userId: number, name: string) => {
    if (!window.confirm(`Выгнать ${name}? По ссылке он сможет попроситься снова.`)) return;

    try {
      await api(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось выгнать участника.');
    }
  };

  const banMember = async (userId: number, name: string) => {
    if (!window.confirm(`Забанить ${name}? Он больше не войдёт на доску, даже по ссылке.`)) return;

    try {
      await api(`/boards/${boardId}/members/${userId}/ban`, { method: 'POST' });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось забанить участника.');
    }
  };

  const changeGuestRole = async (guestId: string, role: BoardRole) => {
    try {
      await api(`/boards/${boardId}/guests/role`, { method: 'POST', body: { guestId, role } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить роль.');
    }
  };

  const removeGuest = async (guestId: string, name: string) => {
    if (!window.confirm(`Выгнать ${name} с доски?`)) return;

    try {
      await api(`/boards/${boardId}/guests/remove`, { method: 'POST', body: { requestId: guestId } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось выгнать гостя.');
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
            className="btn-quiet menu__item"
            type="button"
            onClick={() => kickMember(member.userId, member.displayName)}
          >
            Выгнать
          </button>
          <button
            className="btn-quiet menu__item menu__item--danger"
            type="button"
            onClick={() => banMember(member.userId, member.displayName)}
          >
            Забанить
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

      {/* Забанить гостя нельзя: опознаётся он только меткой браузера,
          а она стирается вместе с данными сайта. */}
      {canManage ? (
        <Menu label={`Действия: ${guest.displayName}`}>
          <button
            className="btn-quiet menu__item"
            type="button"
            onClick={() => changeGuestRole(guest.guestId, guest.role === 'editor' ? 'viewer' : 'editor')}
          >
            {guest.role === 'editor' ? 'Сделать наблюдателем' : 'Сделать редактором'}
          </button>
          <button
            className="btn-quiet menu__item menu__item--danger"
            type="button"
            onClick={() => removeGuest(guest.guestId, guest.displayName)}
          >
            Выгнать
          </button>
        </Menu>
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

  // Кто сейчас на доске — отдельным списком: состав доски и подключённые
  // прямо сейчас это разные вещи, а прыгать можно только ко второму.
  const others = present.filter((person) => person.connectionId !== meConnectionId);
  const cursorOf = (connectionId: string) => cursors.find((cursor) => cursor.id === connectionId);

  const allRows = [...memberRows, ...guestRows, ...(selfRow ? [selfRow] : [])];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = allRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      {error ? <p className="note note-danger">{error}</p> : null}

      {others.length > 0 ? (
        <>
          <p className="people__group">Сейчас на доске</p>
          <ul className="people">
            {others.map((person) => {
              const at = cursorOf(person.connectionId);

              return (
                <li className="people__item" key={person.connectionId}>
                  <span className="people__icon" title={roleTitle(person.role)}>
                    {person.isGuest ? <IconGuest /> : <RoleIcon role={person.role} />}
                  </span>

                  {/* Щелчок по имени переносит холст к его курсору. Пока
                      человек не двинул указателем, идти некуда — и кнопка
                      об этом честно говорит, а не молчит. */}
                  <button
                    className="people__goto"
                    type="button"
                    disabled={!at}
                    onClick={() => onGoTo(person.connectionId)}
                    title={at ? 'Показать, где он сейчас' : 'Пока не видно: он ещё не двигал указателем'}
                  >
                    {person.displayName}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {canManage && waiting.length > 0 ? (
        <>
          <p className="people__group">Просятся на доску</p>
          <ul className="people">
            {waiting.map((request) => (
              <li className="people__item people__item--waiting" key={request.requestId}>
                <div className="people__row">
                  <span className="people__icon">
                    {request.isGuest ? <IconGuest /> : <IconViewer />}
                  </span>
                  <span className="people__name">{request.displayName}</span>
                </div>

                {/* Роль выбирается прямо здесь: «впустить», а потом отдельно
                    «назначить роль» — два действия там, где нужно одно. */}
                <div className="people__row people__row--actions">
                  <button
                    className="btn-primary btn-sm"
                    type="button"
                    onClick={() => admit(request.requestId, 'editor')}
                  >
                    <IconCheck size={16} /> Редактор
                  </button>

                  <button
                    className="btn-quiet btn-sm"
                    type="button"
                    onClick={() => admit(request.requestId, 'viewer')}
                  >
                    Наблюдатель
                  </button>

                  <button
                    className="btn-tool"
                    type="button"
                    onClick={() => reject(request.requestId)}
                    aria-label={`Отклонить: ${request.displayName}`}
                    title="Отклонить"
                  >
                    <IconClose size={16} />
                  </button>
                </div>
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
