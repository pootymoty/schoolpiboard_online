import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { readGuestToken, writeGuestToken } from '../api/guest';
import type { BoardState } from '../api/types';
import { BoardShell } from '../components/Layout';
import { CanvasPanel } from '../components/CanvasPanel';
import { Modal } from '../components/Modal';
import { PeoplePanel } from '../components/PeoplePanel';
import { IconLink, IconLockClosed, IconLockOpen, IconPeople } from '../components/Icons';
import { BoardCanvas } from '../board/BoardCanvas';
import type { Tool } from '../board/BoardCanvas';
import { BoardToolbar } from '../board/BoardToolbar';
import { useBoardHub } from '../board/useBoardHub';
import { useWaitingQueue } from '../board/useWaitingQueue';
import { useHistory } from '../board/useHistory';
import { INITIAL_VIEWPORT, fitToContent, zoomAt } from '../board/viewport';
import type { Viewport } from '../board/viewport';

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

  // Свёрнута по умолчанию: на телефоне список участников занимает весь
  // экран и закрывает холст, а бейдж на кнопке всё равно сообщит о новых
  // заявках в очереди, даже пока панель скрыта.
  const [showPeople, setShowPeople] = useState(false);
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

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#2A211C');
  const [penWidth, setPenWidth] = useState(4);

  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState<number[]>([]);

  const hub = useBoardHub(id);
  const queue = useWaitingQueue(id, hub.canManage);

  const history = useHistory({
    create: (type, data) => hub.commitItem(`redo-${Date.now().toString(36)}`, type, data),
    move: (itemIds, dx, dy) => hub.moveItems(itemIds, dx, dy),
    remove: (itemIds) => hub.deleteItems(itemIds),
  });

  /** Свои штрихи, ждущие номера от сервера. Отменять можно только своё. */
  const myStrokes = useRef(new Set<string>());

  // Номер объекта известен только после закрепления на сервере — тогда же
  // штрих и попадает в историю.
  useEffect(() => {
    const commit = hub.lastCommit;
    if (!commit || !myStrokes.current.has(commit.tempId)) return;

    myStrokes.current.delete(commit.tempId);
    history.push({ kind: 'create', itemIds: [commit.itemId] });
  }, [hub.lastCommit, history]);

  // Выделять то, чего уже нет, нельзя: объект мог стереть кто-то другой.
  useEffect(() => {
    const alive = new Set(hub.items.map((item) => item.id));
    setSelection((current) => (
      current.every((id) => alive.has(id)) ? current : current.filter((id) => alive.has(id))
    ));
  }, [hub.items]);

  const removeSelection = useCallback(() => {
    if (selection.length === 0) return;

    const doomed = hub.items.filter((item) => selection.includes(item.id));
    history.push({ kind: 'delete', items: doomed.map((item) => ({ type: item.type, data: item.data })) });

    hub.deleteItems(selection);
    setSelection([]);
  }, [hub, history, selection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const control = event.ctrlKey || event.metaKey;

      if (control && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo(); else history.undo();
        return;
      }

      if (control && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        return;
      }

      if (control && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection(hub.items.map((item) => item.id));
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelection();
        return;
      }

      // Esc возвращает к курсору и снимает выделение — как в десктопной версии.
      if (event.key === 'Escape') setSelection([]);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, hub.items, removeSelection]);

  // Наблюдателю рисующие инструменты недоступны — оставляем ему руку,
  // иначе выбранное «перо» просто ничего не делало бы (пункт про роли).
  useEffect(() => {
    if (!hub.canEdit && tool !== 'hand') setTool('hand');
  }, [hub.canEdit, tool]);

  const zoomBy = (factor: number) => {
    // От середины холста: кнопкой масштабируют, не целясь в точку.
    setViewport((current) => zoomAt(current, canvasSize.width / 2, canvasSize.height / 2, factor));
  };

  const fitToAll = () => {
    const points = hub.items.flatMap((item) => item.data.points ?? []);
    const next = fitToContent(points, canvasSize.width, canvasSize.height);
    if (next) setViewport(next);
  };

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

  const leaveGuest = async () => {
    try {
      // Владелец не должен видеть ушедшего гостя ещё до истечения допуска —
      // сообщаем серверу явно, а не ждём, пока запись протухнет сама.
      await api(`/boards/${id}/leave`, { method: 'POST', guestToken: readGuestToken(id) });
    } catch {
      // Сеть подвела — не страшно: запись пропадёт сама по истечении допуска.
    } finally {
      writeGuestToken(id, null);
      navigate('/', { replace: true });
    }
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
  // Пока хаб не подключился, показываем список из состояния доски: пустой
  // счётчик на секунду выглядел бы как «на доске никого».
  const presentCount = hub.status === 'ready'
    ? hub.participants.length
    : members.length + otherGuests.length + (me.isGuest ? 1 : 0);

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
            {/* Считаем подключённых сейчас, а не записанных в участники:
                на занятии важно, кто здесь, а не кто когда-то заходил. */}
            <span>Участники{presentCount ? ` · ${presentCount}` : ''}</span>
            {queue.waiting.length > 0 ? (
              <span className="badge-dot" aria-label={`Ждут допуска: ${queue.waiting.length}`}>
                {queue.waiting.length}
              </span>
            ) : null}
          </button>
        </div>

        {error ?? hub.error ? <p className="note note-danger">{error ?? hub.error}</p> : null}

        {board.locked && board.canManage ? (
          <p className="note note-warning">
            Доска закрыта: новые по ссылке войти не могут. Те, кто уже здесь,
            остаются.
          </p>
        ) : null}

        {/* Панель показывается всем: наблюдателю нужны рука и масштаб,
            а рисующие кнопки у него просто заблокированы. */}
        <BoardToolbar
          tool={tool}
          color={color}
          width={penWidth}
          canEdit={hub.canEdit}
          canManage={hub.canManage}
          scale={viewport.scale}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          hasSelection={selection.length > 0}
          onTool={setTool}
          onColor={setColor}
          onWidth={setPenWidth}
          onZoom={zoomBy}
          onResetZoom={() => setViewport((current) => ({ ...current, scale: 1 }))}
          onFit={fitToAll}
          onUndo={history.undo}
          onRedo={history.redo}
          onDelete={removeSelection}
          onClear={() => {
            if (window.confirm('Очистить доску? Всё нарисованное пропадёт у всех.')) hub.clearBoard();
          }}
        />

        <section className="board-page__canvas">
          <BoardCanvas
            hub={hub}
            tool={tool}
            color={color}
            width={penWidth}
            viewport={viewport}
            selection={selection}
            onViewport={setViewport}
            onSize={setCanvasSize}
            onSelection={setSelection}
            onMoved={(itemIds, dx, dy) => {
              hub.moveItems(itemIds, dx, dy);
              history.push({ kind: 'move', itemIds, dx, dy });
            }}
            onCreated={(tempId) => myStrokes.current.add(tempId)}
          />

          {hub.status !== 'ready' ? (
            <p className="canvas-status">
              {hub.status === 'failed'
                ? 'Связь с доской потеряна. Нарисованное сохранится, когда связь вернётся.'
                : hub.status === 'reconnecting'
                  ? 'Связь прервалась — восстанавливаем…'
                  : 'Подключаемся к доске…'}
            </p>
          ) : null}

          {hub.status === 'ready' && !hub.canEdit ? (
            <p className="canvas-status">Вы наблюдаете: доступны только просмотр и масштаб.</p>
          ) : null}

          {showPeople ? (
            <CanvasPanel title="Участники" onClose={() => setShowPeople(false)}>
              <PeoplePanel
                boardId={id}
                canManage={board.canManage}
                members={members}
                guests={otherGuests}
                guestName={me.isGuest ? me.displayName : null}
                queue={queue}
                onChanged={load}
              />
            </CanvasPanel>
          ) : null}
        </section>

        {me.isGuest ? (
          <p className="text-muted small">
            Вы на доске как гость — доска у вас не сохранится.{' '}
            <button className="btn-quiet btn-sm" type="button" onClick={leaveGuest}>Выйти</button>
          </p>
        ) : null}
      </div>

      {showLink && board.linkUrl ? (
        <Modal title="Ссылка на доску" onClose={() => setShowLink(false)}>
          <p className="text-muted small">Действует час, потом обновляется сама.</p>

          <div className="link-box link-box--stack">
            <input type="text" readOnly value={board.linkUrl} onFocus={(e) => e.target.select()} />
            <button className="btn-primary btn-block" type="button" onClick={() => copy(board.linkUrl!)}>
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
            Пришедшие попадут на доску наблюдателями, минуя очередь.
          </p>

          <button
            className="btn-danger btn-block"
            type="button"
            onClick={reissue}
            style={{ marginTop: 'var(--sp-5)' }}
          >
            Выпустить новую ссылку
          </button>
          <p className="text-muted small">Прежняя перестанет работать сразу.</p>
        </Modal>
      ) : null}
    </BoardShell>
  );
}
