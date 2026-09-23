import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { deleteRecording, listRecordings } from '../api/recordings';
import type { RecordingInfo } from '../api/recordings';
import { ApiError } from '../api/client';
import type { RecordingStatus } from './protocol';

interface Props {
  boardId: number;
  canManage: boolean;
  /** Идёт ли запись прямо сейчас — от живого хаба, а не из списка. */
  live: RecordingStatus | null;
  onStart: (title?: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
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
 * Записи занятий: список, старт/пауза/стоп и воспроизведение.
 *
 * Начинать может только владелец — управляющие кнопки видит только он.
 * Метку «идёт запись» видят все: участник должен знать, что его сейчас
 * записывают, а не выяснять это по слухам.
 */
export function RecordingsPanel({
  boardId, canManage, live, onStart, onPause, onResume, onStop, onWatch, onClose,
}: Props): ReactElement {
  const [rows, setRows] = useState<RecordingInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');

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

  return (
    <div className="params params--right params--tall" role="dialog" aria-label="Записи занятий">
      <div className="params__head">
        <span className="params__title">Записи занятия</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      {canManage ? (
        live ? (
          <div className="library__keep">
            <p className="library__hint">
              {live.status === 'recording' ? 'Идёт запись.' : 'Запись на паузе.'}
            </p>

            <div className="params__row">
              {live.status === 'recording' ? (
                <button className="btn btn-sm" type="button" onClick={onPause}>Пауза</button>
              ) : (
                <button className="btn btn-sm" type="button" onClick={onResume}>Продолжить</button>
              )}
              <button className="btn-quiet btn-sm" type="button" onClick={onStop}>Стоп</button>
            </div>
          </div>
        ) : (
          <div className="library__keep">
            <input
              className="input"
              type="text"
              value={title}
              maxLength={80}
              placeholder="Название занятия (не обязательно)"
              onChange={(event) => setTitle(event.target.value)}
            />
            <button
              className="btn btn-sm btn-block"
              type="button"
              onClick={() => { onStart(title.trim() || undefined); setTitle(''); }}
            >
              Начать запись
            </button>
          </div>
        )
      ) : live ? (
        <p className="library__hint">
          {live.status === 'recording' ? 'Владелец сейчас записывает занятие.' : 'Запись занятия на паузе.'}
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
                <button
                  className="btn-quiet btn-sm"
                  type="button"
                  onClick={() => drop(row)}
                  aria-label={`Удалить запись ${row.title || formatDate(row.startedAt)}`}
                  title="Удалить запись"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
