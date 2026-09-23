import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { deleteRecording, listMyRecordings, renameRecording } from '../api/recordings';
import type { RecordingLibraryEntry } from '../api/recordings';
import { ApiError } from '../api/client';
import { BoardShell, Page } from '../components/Layout';
import { Modal } from '../components/Modal';
import { RecordingPlayer } from '../board/RecordingPlayer';
import { IconEditor, IconTrash } from '../components/Icons';

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * Мои записи — по всем доскам, куда есть доступ, в одном месте.
 *
 * Открывается тот же плеер, что и с доски, — вместо экрана целиком, а
 * не мелким окном: разница только в том, откуда сюда попали.
 */
export function RecordingsLibraryPage(): ReactElement {
  const [rows, setRows] = useState<RecordingLibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<{ boardId: number; recordingId: number } | null>(null);
  const [renaming, setRenaming] = useState<RecordingLibraryEntry | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const load = () => {
    listMyRecordings()
      .then(setRows)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось прочитать записи.'));
  };

  useEffect(load, []);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;

    try {
      await renameRecording(renaming.boardId, renaming.id, newTitle.trim());
      setRenaming(null);
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось переименовать.');
    }
  };

  const drop = (row: RecordingLibraryEntry) => {
    if (!window.confirm(`Удалить запись «${row.title || formatDate(row.startedAt)}»?`)) return;

    deleteRecording(row.boardId, row.id)
      .then(() => setRows((current) => (current ?? []).filter((x) => x.id !== row.id)))
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить.'));
  };

  if (watching) {
    return (
      <BoardShell>
        <div className="board-page">
          <section className="board-page__canvas">
            <RecordingPlayer
              boardId={watching.boardId}
              recordingId={watching.recordingId}
              onClose={() => setWatching(null)}
            />
          </section>
        </div>
      </BoardShell>
    );
  }

  return (
    <Page narrow>
      <h1>Мои записи</h1>
      <p className="text-muted">Записи занятий по всем доскам, куда у вас есть доступ.</p>

      {error ? <p className="note note-danger">{error}</p> : null}

      {rows === null ? (
        <p className="text-muted">Читаем…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted">Пока ни одной записи.</p>
      ) : (
        <div className="library__list">
          {rows.map((row) => (
            <div className="library__mine" key={row.id}>
              <button
                className="btn-quiet library__pick"
                type="button"
                onClick={() => setWatching({ boardId: row.boardId, recordingId: row.id })}
              >
                {row.title || formatDate(row.startedAt)}
                <span className="library__count">{row.boardTitle} · {formatDuration(row.durationMs)}</span>
              </button>

              <Link className="btn-quiet btn-sm" to={`/boards/${row.boardId}`} title="Открыть доску">
                На доску
              </Link>

              {row.canManage ? (
                <>
                  <button
                    className="btn-quiet btn-sm"
                    type="button"
                    onClick={() => { setRenaming(row); setNewTitle(row.title ?? ''); }}
                    aria-label={`Переименовать запись ${row.title || formatDate(row.startedAt)}`}
                    title="Переименовать"
                  >
                    <IconEditor />
                  </button>

                  <button
                    className="btn-quiet btn-sm"
                    type="button"
                    onClick={() => drop(row)}
                    aria-label={`Удалить запись ${row.title || formatDate(row.startedAt)}`}
                    title="Удалить запись"
                  >
                    <IconTrash />
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {renaming ? (
        <Modal title="Переименовать запись" onClose={() => setRenaming(null)}>
          <form onSubmit={rename}>
            <div className="field">
              <label htmlFor="recordingTitle">Название</label>
              <input
                id="recordingTitle"
                type="text"
                maxLength={80}
                autoFocus
                placeholder="Без названия"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
            </div>
            <button className="btn-primary btn-block" type="submit">Сохранить</button>
          </form>
        </Modal>
      ) : null}
    </Page>
  );
}
