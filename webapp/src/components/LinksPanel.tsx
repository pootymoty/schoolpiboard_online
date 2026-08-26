import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { api, ApiError } from '../api/client';
import type { BoardLink } from '../api/types';

/** Ссылки на доску. Видит и создаёт только владелец. */
export function LinksPanel({ boardId }: { boardId: number }): ReactElement {
  const [links, setLinks] = useState<BoardLink[]>([]);
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks(await api<BoardLink[]>(`/boards/${boardId}/links`));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить ссылки.');
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    try {
      const link = await api<BoardLink>(`/boards/${boardId}/links`, {
        method: 'POST',
        body: { role, label: label || null },
      });
      setLinks((current) => [link, ...current]);
      setLabel('');
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось создать ссылку.');
    }
  };

  const revoke = async (linkId: number) => {
    try {
      await api(`/boards/${boardId}/links/${linkId}`, { method: 'DELETE' });
      setLinks((current) => current.filter((link) => link.id !== linkId));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отозвать ссылку.');
    }
  };

  const copy = async (link: BoardLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Буфер обмена может быть недоступен — ссылка видна и её можно выделить.
      setError('Скопировать не вышло. Выделите ссылку и скопируйте вручную.');
    }
  };

  return (
    <section className="card panel">
      <h2>Ссылки на доску</h2>
      <p className="text-muted small">
        Кто откроет ссылку, войдёт с её ролью. Регистрация для этого не нужна.
      </p>

      <div className="invite-form">
        <select value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')}>
          <option value="editor">может работать на доске</option>
          <option value="viewer">только смотрит</option>
        </select>

        <input type="text" maxLength={100} placeholder="Подпись: для кого эта ссылка"
               value={label} onChange={(event) => setLabel(event.target.value)} />

        <button className="btn-primary" type="button" onClick={create}>Создать ссылку</button>
      </div>

      {error ? <p className="note note-danger">{error}</p> : null}

      {links.length === 0 ? (
        <p className="text-muted">Ссылок пока нет.</p>
      ) : (
        <ul className="invite-list">
          {links.map((link) => (
            <li key={link.id}>
              <div className="row">
                <span className={`badge badge-${link.role}`}>
                  {link.role === 'editor' ? 'работает' : 'смотрит'}
                </span>
                {link.label ? <span className="text-muted small">{link.label}</span> : null}
              </div>

              <code className="fresh-invite">{link.url}</code>

              <div className="row">
                <button className="btn-quiet" type="button" onClick={() => copy(link)}>
                  {copied === link.id ? 'Скопировано' : 'Копировать'}
                </button>
                <button className="btn-danger btn-sm" type="button" onClick={() => revoke(link.id)}>
                  Отозвать
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted small">
        Отозванная ссылка перестаёт работать сразу. Те, кто успел войти под
        своей учётной записью, доску не теряют — у них доступ держится не на
        ссылке. Гости отключаются.
      </p>
    </section>
  );
}
