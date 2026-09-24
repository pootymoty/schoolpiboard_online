import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { deleteRecording, listRecordings, renameRecording } from '../api/recordings';
import type { RecordingInfo } from '../api/recordings';
import { ApiError } from '../api/client';
import type { RecordingStatus } from './protocol';
import { Modal } from '../components/Modal';
import { IconEditor, IconTrash } from '../components/Icons';

interface Props {
  boardId: number;
  canManage: boolean;
  /**
   * Идёт ли запись прямо сейчас — от живого хаба, а не из списка. Сама
   * эта панель управление записью больше не показывает (пауза и стоп —
   * прямо на панели инструментов, см. `BoardToolbar`); значение здесь
   * только чтобы перечитать список после «Стоп» и не показывать форму
   * запуска повторно, если панель открыли снова, пока запись уже идёт.
   */
  live: RecordingStatus | null;
  onStart: (title?: string, seedExisting?: boolean) => void;
  /** Открыть просмотр — вместо холста, этим распоряжается страница доски. */
  onWatch: (recordingId: number) => void;
  onClose: () => void;
}

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
 * Записи занятий: старт и список сохранённых для просмотра.
 *
 * Начинать может только владелец. Пауза и стоп — уже не здесь, а прямо
 * на панели инструментов (см. `BoardToolbar`): начал запись — эта форма
 * не нужна, дальше управление одним кликом, без захода в панель. Метку
 * «идёт запись» видят все: участник должен знать, что его сейчас
 * записывают, а не выяснять это по слухам.
 */
export function RecordingsPanel({
  boardId, canManage, live, onStart, onWatch, onClose,
}: Props): ReactElement {
  const [rows, setRows] = useState<RecordingInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [seedExisting, setSeedExisting] = useState(false);
  const [renaming, setRenaming] = useState<RecordingInfo | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const load = () => {
    listRecordings(boardId)
      .then(setRows)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось прочитать записи.'));
  };

  // Перечитываем список при каждой смене состояния записи: свежая
  // запись должна появиться в списке сразу после «Стоп», а не после
  // случайного повторного открытия панели.
  useEffect(load, [boardId, live?.status]);

  const drop = (recording: RecordingInfo) => {
    if (!window.confirm(`Удалить запись «${recording.title || formatDate(recording.startedAt)}»?`)) return;

    deleteRecording(boardId, recording.id)
      .then(() => setRows((current) => (current ?? []).filter((x) => x.id !== recording.id)))
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить.'));
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;

    try {
      await renameRecording(boardId, renaming.id, newTitle.trim());
      setRenaming(null);
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось переименовать.');
    }
  };

  return (
    <div className="params params--right params--tall" role="dialog" aria-label="Записи занятий">
      <div className="params__head">
        <span className="params__title">Записи занятия</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      {canManage && !live ? (
        <div className="library__keep">
          <input
            className="input"
            type="text"
            value={title}
            maxLength={80}
            placeholder="Название занятия (не обязательно)"
            onChange={(event) => setTitle(event.target.value)}
          />

          <label className="library__toggle">
            <input
              type="checkbox"
              checked={seedExisting}
              onChange={(event) => setSeedExisting(event.target.checked)}
            />
            Начать с того, что уже нарисовано на странице
          </label>

          <button
            className="btn btn-sm btn-block"
            type="button"
            onClick={() => { onStart(title.trim() || undefined, seedExisting); setTitle(''); }}
          >
            Начать запись
          </button>
        </div>
      ) : live ? (
        <p className="library__hint">
          {canManage
            ? (live.status === 'recording' ? 'Идёт запись — пауза и стоп на панели инструментов.' : 'Запись на паузе — продолжить и стоп на панели инструментов.')
            : (live.status === 'recording' ? 'Владелец сейчас записывает занятие.' : 'Запись занятия на паузе.')}
        </p>
      ) : null}

      <p className="params__label">Сохранённые записи</p>

      {error ? <p className="library__hint library__note">{error}</p> : null}

      {rows === null ? (
        <p className="library__hint">Читаем…</p>
      ) : rows.filter((x) => x.status === 'stopped').length === 0 ? (
        <p className="library__hint">Пока ни одной.</p>
      ) : (
        <div className="library__list">
          {rows.filter((x) => x.status === 'stopped').map((row) => (
            <div className="library__mine" key={row.id}>
              <button
                className="btn-quiet library__pick"
                type="button"
                onClick={() => onWatch(row.id)}
                title="Смотреть"
              >
                {row.title || formatDate(row.startedAt)}
                <span className="library__count">{formatDuration(row.durationMs)}</span>
              </button>

              {canManage ? (
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
    </div>
  );
}
