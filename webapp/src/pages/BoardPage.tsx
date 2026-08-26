import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { readGuestToken, writeGuestToken } from '../api/guest';
import type { BoardState } from '../api/types';
import { BoardShell } from '../components/Layout';
import { Modal } from '../components/Modal';
import { PeoplePanel } from '../components/PeoplePanel';
import { IconLink, IconLockClosed, IconLockOpen, IconPeople } from '../components/Icons';

/**
 * Страница доски.
 *
 * На виду только холст и участники: на доске рисуют, и всё, что нужно
 * изредка — ссылка, замок, настройки — убрано в кнопки и всплывающие окна.
 */
export function BoardPage(): ReactElement {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const id = Number(boardId);

  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showPeople, setShowPeople] = useState(true);
  // Сразу после создания доски открываем окно со ссылкой сами: доска на
  // пустом экране обещает, что ссылка появится сразу, а не через три клика.
  const [showLink, setShowLink] = useState(() => Boolean((location.state as { openLink?: boolean } | null)?.openLink));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Флаг нужен только один раз, сразу после перехода: убираем его из
    // истории, иначе окно снова откроется при возврате кнопкой «назад».
    if ((location.state as { openLink?: boolean } | null)?.openLink) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // Срабатывает один раз при монтировании: id доски в пути не меняется.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [waitingCount, setWaitingCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setState(await api<BoardState>(`/boards/${id}/state`, { guestToken: readGuestToken(id) }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть доску.');
    }
  }, [id]);

  // Хаба с живым присутствием пока нет (появится вместе с холстом), поэтому
  // список участников и состояние доски держим свежими опросом: иначе
  // подключившийся не появится у остальных, пока кто-то не обновит страницу.
  useEffect(() => {
    if (!Number.isFinite(id)) return;

    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [id, load]);

  const toggleLock = async () => {
    if (!state) return;
    setBusy(true);

    try {
      await api(`/boards/${id}/lock`, { method: 'POST', body: { value: !state.board.locked } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить замок.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoAdmit = async () => {
    if (!state) return;

    try {
      await api(`/boards/${id}/auto-admit`, { method: 'POST', body: { value: !state.board.autoAdmit } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить настройку.');
    }
  };

  const reissue = async () => {
    if (!window.confirm('Выпустить новую ссылку? Прежняя перестанет работать сразу.')) return;

    try {
      await api(`/boards/${id}/reissue-link`, { method: 'POST' });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перевыпустить ссылку.');
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер может быть недоступен — ссылка видна, её можно выделить руками.
      setError('Скопировать не вышло. Выделите ссылку и скопируйте вручную.');
    }
  };

  const leaveGuest = () => {
    writeGuestToken(id, null);
    navigate('/', { replace: true });
  };

  if (error && !state) {
    return (
      <BoardShell>
        <div className="card">
          <h1>Доска</h1>
          <p className="note note-danger">{error}</p>
          <p className="text-muted small">
            Возможно, вас убрали с доски или ссылку перевыпустили. Попросите
            новую у того, кто вас позвал.
          </p>
        </div>
      </BoardShell>
    );
  }

  if (!state) {
    return (
      <BoardShell>
        <p className="text-muted">Загружаем доску…</p>
      </BoardShell>
    );
  }

  const { board, me, members, guests } = state;
  // Свой собственный гостевой вход отдельной строкой ниже — из общего
  // списка его убираем, иначе человек видел бы себя дважды.
  const otherGuests = guests.filter((guest) => guest.guestId !== me.guestId);
  const presentCount = members.length + otherGuests.length + (me.isGuest ? 1 : 0);

  return (
    <BoardShell>
      <div className="board-page">
        <div className="board-page__bar">
          <h1 className="board-page__title">{board.title}</h1>

          {board.canManage ? (
            <>
              <button
                className="btn-tool btn-tool--wide"
                type="button"
                onClick={toggleLock}
                disabled={busy}
                aria-pressed={board.locked}
                title={board.locked
                  ? 'Доска закрыта: по ссылке не войти. Нажмите, чтобы открыть'
                  : 'Доска открыта: по ссылке можно проситься. Нажмите, чтобы закрыть'}
              >
                {board.locked ? <IconLockClosed /> : <IconLockOpen />}
                <span>{board.locked ? 'Закрыта' : 'Открыта'}</span>
              </button>

              <button
                className="btn-tool btn-tool--wide"
                type="button"
                onClick={() => setShowLink(true)}
                title="Ссылка на доску"
              >
                <IconLink />
                <span>Ссылка</span>
              </button>
            </>
          ) : null}

          <button
            className="btn-tool btn-tool--wide"
            type="button"
            onClick={() => setShowPeople((current) => !current)}
            aria-pressed={showPeople}
            title="Участники"
          >
            <IconPeople />
            <span>Участники{presentCount ? ` · ${presentCount}` : ''}</span>
            {!showPeople && waitingCount > 0 ? (
              <span className="badge-dot" aria-label={`Ждут допуска: ${waitingCount}`}>{waitingCount}</span>
            ) : null}
          </button>
        </div>

        {error ? <p className="note note-danger">{error}</p> : null}

        {board.locked && board.canManage ? (
          <p className="note note-warning">
            Доска закрыта: новые по ссылке войти не могут. Те, кто уже здесь,
            остаются.
          </p>
        ) : null}

        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
          <section className="board-page__canvas" style={{ flex: 1 }}>
            <div>
              <h2 className="card-title">Здесь появится холст</h2>
              <p className="text-muted">
                Рисование и совместная работа — следующий этап. Сейчас готово
                всё вокруг холста: доступ, роли и участники.
              </p>
              {!board.canEdit ? (
                <p className="text-muted small">
                  У вас доступ только на просмотр. Это проверяет сервер,
                  а не только интерфейс.
                </p>
              ) : null}
            </div>
          </section>

          {showPeople ? (
            <aside className="card" style={{ width: '300px', flex: 'none' }}>
              <PeoplePanel
                boardId={id}
                canManage={board.canManage}
                members={members}
                guests={otherGuests}
                guestName={me.isGuest ? me.displayName : null}
                onChanged={load}
                onWaitingCount={setWaitingCount}
              />
            </aside>
          ) : null}
        </div>

        {me.isGuest ? (
          <p className="text-muted small">
            Вы на доске как гость — доска у вас не сохранится.{' '}
            <button className="btn-quiet btn-sm" type="button" onClick={leaveGuest}>Выйти</button>
          </p>
        ) : null}
      </div>

      {showLink && board.linkUrl ? (
        <Modal title="Ссылка на доску" onClose={() => setShowLink(false)}>
          <p className="text-muted small">
            Отправьте её тем, кого ждёте. Кто перейдёт — попросится на доску,
            а вы решите, впускать ли его и с какой ролью.
          </p>

          <div className="link-box">
            <input type="text" readOnly value={board.linkUrl} onFocus={(e) => e.target.select()} />
            <button className="btn-primary" type="button" onClick={() => copy(board.linkUrl!)}>
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>

          <div className="check" style={{ marginTop: 'var(--sp-5)' }}>
            <input
              id="autoAdmit"
              type="checkbox"
              checked={board.autoAdmit}
              onChange={toggleAutoAdmit}
            />
            <label htmlFor="autoAdmit">Впускать сразу, без спроса</label>
          </div>
          <p className="text-muted small">
            Пришедшие по ссылке попадут на доску наблюдателями, минуя очередь.
            Удобно для лекции на много человек; для обычного занятия лучше
            оставить выключенным.
          </p>

          <button
            className="btn-danger btn-block"
            type="button"
            onClick={reissue}
            style={{ marginTop: 'var(--sp-5)' }}
          >
            Выпустить новую ссылку
          </button>
          <p className="text-muted small">
            Прежняя перестанет работать сразу. Те, кого вы уже впустили под
            учётной записью, доску не потеряют.
          </p>
        </Modal>
      ) : null}
    </BoardShell>
  );
}
