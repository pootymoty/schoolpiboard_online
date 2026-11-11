import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { askSummary, declineSummaryRequest, getSummaryAudience, sendSummary } from '../api/summary';
import type { SummaryAudience, SummaryAudienceKind, SummaryRequest } from '../api/summary';
import { ApiError } from '../api/client';
import { readGuestToken } from '../api/guest';
import { sheetsToPdf, sheetsToPdfBlob } from './exportPdf';

/** Столько же листов принимает сервер: предел одинаковый по обе стороны. */
export const MAX_SHEETS = 12;

interface Props {
  boardId: number;
  /** Имя доски — для названия файла и подписи письма. */
  title: string;
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
  boardId, title, canManage, requests, onResolved, collect, onClose,
}: Props): ReactElement {
  const [email, setEmail] = useState('');
  const [asPdf, setAsPdf] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [audience, setAudience] = useState<SummaryAudience | null>(null);
  const [whom, setWhom] = useState<SummaryAudienceKind>('online');

  // Сколько участников получит рассылку — спрашиваем при открытии окна:
  // кто на доске, меняется по ходу занятия.
  useEffect(() => {
    if (!canManage) return;
    getSummaryAudience(boardId).then(setAudience).catch(() => setAudience(null));
  }, [boardId, canManage]);

  const audienceCount = audience ? audience[whom] : 0;

  const fail = (reason: unknown, fallback: string) => {
    setNote(reason instanceof ApiError ? reason.message : fallback);
    setBusy(null);
  };

  const download = async () => {
    setNote(null);
    setBusy('Собираем листы…');

    try {
      const sheets = await collect();

      if (sheets.length === 0) {
        setBusy(null);
        setNote('Скачивать нечего: на страницах пусто.');
        return;
      }

      await sheetsToPdf(sheets, title);
      setBusy(null);
    } catch (reason) {
      fail(reason, 'PDF не собрался.');
    }
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

  const send = async (requestId: number | null, members: SummaryAudienceKind | null = null) => {
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

      if (asPdf) {
        const pdf = await sheetsToPdfBlob(sheets);
        if (!pdf) {
          setBusy(null);
          setNote('Отправлять нечего: на страницах пусто.');
          return;
        }

        await sendSummary(
          boardId, requestId, [{ name: `${title || 'Конспект'}.pdf`, blob: pdf }], sheets.length, members,
        );
      } else {
        await sendSummary(boardId, requestId, sheets, sheets.length, members);
      }

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
            Каждая страница — отдельным листом, не больше {MAX_SHEETS}. Пустые пропускаются.
          </p>

          <label className="library__toggle">
            <input
              type="checkbox"
              checked={asPdf}
              onChange={(event) => setAsPdf(event.target.checked)}
            />
            Одним PDF-файлом, а не картинками
          </label>

          <button
            className="btn btn-sm btn-block"
            type="button"
            disabled={busy !== null}
            onClick={() => void send(null)}
          >
            Отправить себе
          </button>

          <button
            className="btn-quiet btn-sm btn-block"
            type="button"
            disabled={busy !== null}
            onClick={() => void download()}
          >
            Скачать PDF
          </button>

          <p className="params__label">Участникам доски</p>

          <div className="summary__whom" role="radiogroup" aria-label="Кому отправить">
            <label className="library__toggle">
              <input
                type="radio"
                name="summary-whom"
                checked={whom === 'online'}
                onChange={() => setWhom('online')}
              />
              Тем, кто сейчас на доске{audience ? ` — ${audience.online}` : ''}
            </label>

            <label className="library__toggle">
              <input
                type="radio"
                name="summary-whom"
                checked={whom === 'all'}
                onChange={() => setWhom('all')}
              />
              Всем участникам доски{audience ? ` — ${audience.all}` : ''}
            </label>
          </div>

          <button
            className="btn btn-sm btn-block"
            type="button"
            disabled={busy !== null || audienceCount === 0}
            onClick={() => void send(null, whom)}
          >
            Отправить участникам
          </button>

          <p className="library__hint">
            Получат те, кто вошёл под учётной записью и подтвердил почту. Адреса друг друга
            они не увидят.
            {audience && audience.guestsOnline > 0
              ? ` Гостей на доске: ${audience.guestsOnline} — им конспект уйдёт только по их просьбе ниже.`
              : ''}
          </p>

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
            Оставьте адрес — конспект отправит владелец доски. Адрес увидит только он.
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
