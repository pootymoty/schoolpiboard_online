import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { api, ApiError } from '../api/client';
import type { BoardMember } from '../api/types';

/** Участники с учётными записями. Гостей здесь нет — они нигде не хранятся. */
export function MembersPanel({ boardId }: { boardId: number }): ReactElement {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await api<BoardMember[]>(`/boards/${boardId}/members`));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить участников.');
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (userId: number, role: 'editor' | 'viewer') => {
    try {
      await api(`/boards/${boardId}/members/${userId}`, { method: 'PATCH', body: { role } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить роль.');
    }
  };

  const setBanned = async (userId: number, banned: boolean) => {
    try {
      await api(`/boards/${boardId}/members/${userId}/ban`, { method: 'POST', body: { banned } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить доступ.');
    }
  };

  return (
    <section className="card panel">
      <h2>Участники</h2>
      <p className="text-muted small">
        Здесь те, кто вошёл под своей учётной записью. Гости в списке не
        появляются: о них ничего не сохраняется.
      </p>

      {error ? <p className="note note-danger">{error}</p> : null}

      {members.length === 0 ? (
        <p className="text-muted">Пока никого.</p>
      ) : (
        <ul className="member-list">
          {members.map((member) => (
            <li className="member-row" key={member.userId}>
              <div>
                <span className="member-name">{member.displayName}</span>
                <span className="text-muted small"> {member.email}</span>
                {member.banned ? <span className="badge"> доступ закрыт</span> : null}
              </div>

              {member.role === 'owner' ? (
                <span className="badge badge-owner">владелец</span>
              ) : (
                <div className="row">
                  <select
                    value={member.role}
                    onChange={(event) => changeRole(member.userId, event.target.value as 'editor' | 'viewer')}
                  >
                    <option value="editor">работает</option>
                    <option value="viewer">смотрит</option>
                  </select>

                  <button
                    className="btn-quiet"
                    type="button"
                    onClick={() => setBanned(member.userId, !member.banned)}
                  >
                    {member.banned ? 'Вернуть доступ' : 'Закрыть доступ'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
