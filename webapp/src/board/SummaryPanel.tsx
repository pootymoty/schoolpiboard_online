import { useState } from 'react';
import type { ReactElement } from 'react';
import { askSummary, declineSummaryRequest, sendSummary } from '../api/summary';
import type { SummaryRequest } from '../api/summary';
import { ApiError } from '../api/client';
import { readGuestToken } from '../api/guest';

/** Столько же листов принимает сервер: предел одинаковый по обе стороны. */
export const MAX_SHEETS = 12;

interface Props {
  boardId: number;
  canManage: boolean;
  /** Просьбы, которые уже пришли владельцу. */
  requests: SummaryRequest[];
  /** Убрать разобранную просьбу, не дожидаясь следующего опроса. */
  onResolved: (requestId: number) => void;
  /** Собирает листы занятия — это умеет только доска. */
  collect: () => Promise<{ name: string; blob: Blob }[]>;
  onClose: () => void;
}

/**
 * Конспект занятия по почте.
 *
 * Участник называет адрес, владелец отправляет. Это не лишний шаг:
 * иначе доска стала бы способом слать письма с вложениями на любой адрес
 * от нашего имени, и разбираться с последствиями пришлось бы нам.
 *
 * Листы рисует браузер прямо здесь — на сервере нет ни холста, ни шрифтов
 * доски, и вторая отрисовка там рано или поздно разошлась бы с первой.
 */
export function SummaryPanel({
  boardId, canManage, requests, onResolved, collect, onClose,
}: Props): ReactElement {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fail = (reason: unknown, fallback: string) => {
    setNote(reason instanceof ApiError ? reason.message : fallback);
    setBusy(null);
  };

  const ask = async () => {
    setBusy('Отправляем просьбу…');
    setNote(null);

    try {
      await askSummary(boardId, email.trim(), readGuestToken(boardId));
      setBusy(null);
      setDone(true);
    } catch (reason) {
      fail(reason, 'Не удалось попросить конспект.');
    }
  };

  const send = async (requestId: number | null) => {
    setNote(null);
    setBusy('Собираем листы…');

    try {
      const sheets = await collect();

      if (sheets.length === 0) {
        setBusy(null);
        setNote('Отправлять нечего: на страницах пусто.');
        return;
      }

      setBusy(`Отправляем ${sheets.length} л.…`);
      await sendSummary(boardId, requestId, sheets);

      if (requestId !== null) onResolved(requestId);

      setBusy(null);
      setDone(true);
    } catch (reason) {
      fail(reason, 'Конспект не отправился.');
    }
  };

  const decline = async (requestId: number) => {
    try {
      await declineSummaryRequest(boardId, requestId);
      onResolved(requestId);
    } catch (reason) {
      fail(reason, 'Не удалось отклонить просьбу.');
    }
  };

  return (
    <div className="params params--right" role="dialog" aria-label="Конспект занятия">
      <div className="params__head">
        <span className="params__title">Конспект</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      {canManage ? (
        <>
          <p className="library__hint">
            Каждая страница занятия уходит письмом отдельным листом — не больше {MAX_SHEETS}.
            Пустые страницы пропускаются.
          </p>

          <button
            className="btn btn-sm btn-block"
            type="button"
            disabled={busy !== null}
            onClick={() => void send(null)}
          >
            Отправить себе
          </button>

          <p className="params__label">Просят конспект</p>

          {requests.length === 0 ? (
            <p className="library__hint">Пока никто не просил.</p>
          ) : (
            <div className="library__list">
              {requests.map((request) => (
                <div className="summary__row" key={request.id}>
                  <span className="summary__who">
                    {request.askedName}
                    <span className="library__count">{request.email}</span>
                  </span>

                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void send(request.id)}
                  >
                    Отправить
                  </button>

                  <button
                    className="btn-quiet btn-sm"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void decline(request.id)}
                  >
                    Отказать
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="library__hint">
            Оставьте адрес — учитель решит, отправлять ли конспект занятия. Письмо придёт от него,
            а не от вас: адрес не увидит никто, кроме него.
          </p>

          <input
            className="input"
            type="email"
            value={email}
            maxLength={254}
            placeholder="почта@пример.ру"
            onChange={(event) => setEmail(event.target.value)}
          />

          <button
            className="btn btn-sm btn-block"
            type="button"
            disabled={busy !== null || email.trim().length < 5}
            onClick={() => void ask()}
          >
            Попросить конспект
          </button>
        </>
      )}

      {busy ? <p className="text-muted small">{busy}</p> : null}
      {note ? <p className="library__hint library__note">{note}</p> : null}
      {done && !busy && !note ? (
        <p className="text-muted small">
          {canManage ? 'Письмо ушло.' : 'Просьба передана учителю.'}
        </p>
      ) : null}
    </div>
  );
}
