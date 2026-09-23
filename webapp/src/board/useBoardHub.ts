import { useCallback, useEffect, useRef, useState } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { API_URL, readToken } from '../api/client';
import { translate } from './geometry';
import { readGuestToken } from '../api/guest';
import type { BoardRole } from '../api/types';
import type {
  BoardItem, BoardPageInfo, Cursor, ItemData, ItemType, JoinedPayload, LiveStroke, PageVisibility,
  Participant, RecordingStatus, ResumedPayload, SyncedPayload, Background,
} from './protocol';
import { DEFAULT_BACKGROUND } from './protocol';

export type HubStatus = 'connecting' | 'ready' | 'reconnecting' | 'failed';

/** Почему доступ к доске пропал именно сейчас, а не выяснился при входе. */
export interface RemovedInfo {
  reason: 'kicked' | 'banned';
}

/**
 * «Все ко мне» от ведущего. `at` — не с сервера, а метка получения: нужна,
 * чтобы повторная команда с той же точки не потерялась в дедупликации по
 * значению — эффект в `BoardPage` следит именно за этим полем.
 */
export interface BroughtToMe {
  pageId: number;
  x: number;
  y: number;
  scale: number;
  at: number;
}

export interface BoardHub {
  status: HubStatus;
  error: string | null;
  role: BoardRole | null;
  canEdit: boolean;
  canManage: boolean;
  /**
   * Владелец выгнал или забанил прямо во время присутствия на доске —
   * не дожидаясь, пока это выяснится само при следующем подключении.
   */
  removed: RemovedInfo | null;
  /** Ведущий перенёс сюда всех остальных. Раз получено — обрабатывается и забывается. */
  broughtToMe: BroughtToMe | null;
  /** Идёт ли сейчас запись занятия — знать нужно любому, не только владельцу. */
  recording: RecordingStatus | null;
  items: BoardItem[];
  /** Чужие штрихи, которые рисуются прямо сейчас. */
  live: Map<string, LiveStroke>;
  participants: Participant[];
  cursors: Cursor[];
  /** Наш идентификатор подключения — чтобы не рисовать собственный курсор. */
  me: string | null;
  /**
   * Закреплённые объекты: по ним свой штрих узнаёт свой номер.
   *
   * Список, а не последний: закрепления приходят пачкой — вставка
   * заготовки это полсотни объектов сразу, — и одно значение состояния
   * React успел бы перезаписать, не показав промежуточные. Тогда часть
   * своих объектов осталась бы без номера, а отмена сняла бы не всё.
   */
  commits: { tempId: string; itemId: number }[];
  background: Background;

  /** Полоса страниц — только те, что открыты этому участнику. */
  pages: BoardPageInfo[];
  /** Открытая сейчас страница. Пусто — не открыто ни одной. */
  pageId: number | null;

  sendCursor: (x: number, y: number) => void;
  beginItem: (tempId: string, type: ItemType, data: ItemData) => void;
  appendPoints: (tempId: string, points: ItemData['points']) => void;
  /**
   * Закрепляет объект. Страница по умолчанию — открытая; чужая нужна
   * тому, кто раскладывает PDF: лист кладётся на только что заведённую
   * страницу, не открывая её у себя.
   */
  commitItem: (
    tempId: string, type: ItemType, data: ItemData, imageRef?: string | null, pageId?: number,
  ) => void;
  cancelItem: (tempId: string) => void;
  setBackground: (background: Background) => void;
  moveItems: (ids: number[], dx: number, dy: number) => void;
  updateItem: (id: number, data: ItemData) => void;
  reorder: (ids: number[], toFront: boolean) => void;
  deleteItems: (ids: number[]) => void;
  clearBoard: () => void;

  openPage: (pageId: number) => void;
  addPage: (title?: string) => void;
  /** Заводит страницу и отвечает её номером. Пусто — не завелась. */
  addPageNow: (title: string) => Promise<number | null>;
  /**
   * Содержимое страницы, не открывая её у себя. Нужно для конспекта:
   * листать всё занятие на глазах у остальных ради письма незачем.
   */
  pageItems: (pageId: number) => Promise<BoardItem[]>;
  renamePage: (pageId: number, title: string) => void;
  deletePage: (pageId: number) => void;
  reorderPages: (order: number[]) => void;
  setPageVisibility: (pageId: number, visibility: PageVisibility, viewers: string[]) => void;

  /** Переносит всех остальных на страницу и вид, переданные здесь. */
  bringEveryone: (pageId: number, x: number, y: number, scale: number) => void;

  /** Запись занятия — доступно только владельцу, сервер сам это проверит. */
  startRecording: (title?: string) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  /** Свой вид — в активную запись, если она идёт. Больше никуда не уходит. */
  reportViewport: (pageId: number, x: number, y: number, scale: number) => void;
}

/**
 * Подключение к доске.
 *
 * Номер последнего события хранится здесь же: при обрыве SignalR
 * переподключается сам, а мы называем этот номер и получаем только
 * пропущенное — доска не перезагружается целиком, и то, что человек
 * нарисовал без связи, не затирается (раздел 7.4).
 */
export function useBoardHub(boardId: number): BoardHub {
  const [status, setStatus] = useState<HubStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<BoardRole | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [removed, setRemoved] = useState<RemovedInfo | null>(null);
  const [broughtToMe, setBroughtToMe] = useState<BroughtToMe | null>(null);
  const [recording, setRecording] = useState<RecordingStatus | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [live, setLive] = useState<Map<string, LiveStroke>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [commits, setCommits] = useState<{ tempId: string; itemId: number }[]>([]);
  const [background, setBackgroundState] = useState<Background>(DEFAULT_BACKGROUND);
  const [pages, setPages] = useState<BoardPageInfo[]>([]);
  const [pageId, setPageId] = useState<number | null>(null);

  const connection = useRef<HubConnection | null>(null);
  const seq = useRef(0);

  /**
   * Открытая страница — ещё и ссылкой: обработчик событий живёт вне
   * React-цикла и иначе видел бы страницу на момент подписки.
   */
  const current = useRef<number | null>(null);

  /** Применяет одно событие доски — и живое, и добранное после обрыва. */
  const apply = useCallback((name: string, payload: any) => {
    switch (name) {
      case 'ItemBegan':
        // Чужая страница рисуется у своих: показывать её здесь незачем.
        if (payload.pageId !== current.current) break;
        setLive((live) => new Map(live).set(payload.tempId, payload as LiveStroke));
        break;

      case 'ItemPoints':
        setLive((live) => {
          const stroke = live.get(payload.tempId);
          if (!stroke) return live;

          const next = new Map(live);
          next.set(payload.tempId, {
            ...stroke,
            data: { ...stroke.data, points: [...(stroke.data.points ?? []), ...payload.points] },
          });
          return next;
        });
        break;

      case 'ItemCancelled':
        setLive((live) => {
          const next = new Map(live);
          next.delete(payload.tempId);
          return next;
        });
        break;

      case 'ItemCommitted':
        // Штрих переезжает из «рисуется» в «нарисовано» — двумя действиями
        // сразу, иначе между ними он мигнул бы, пропав из обоих списков.
        setLive((live) => {
          const next = new Map(live);
          next.delete(payload.tempId);
          return next;
        });

        if (payload.pageId !== current.current) break;

        setItems((items) => [...items.filter((x) => x.id !== payload.item.id), payload.item]);
        // Хвост подрезаем: разобранное давно не нужно, а доска живёт долго.
        setCommits((current) => [...current, {
          tempId: payload.tempId, itemId: payload.item.id,
        }].slice(-500));
        break;

      case 'ItemsMoved':
        setItems((current) => current.map((item) => (
          payload.itemIds.includes(item.id) ? { ...item, data: translate(item.data, payload.dx, payload.dy) } : item
        )));
        break;

      case 'ItemsReordered':
        setItems((current) => {
          const fresh = new Map<number, BoardItem>(
            (payload.items as BoardItem[]).map((item) => [item.id, item]),
          );
          // Пересортировка обязательна: порядок отрисовки задаёт z, а не
          // место в массиве, и без неё переложенное осталось бы на виду
          // там же, где было.
          return current
            .map((item) => fresh.get(item.id) ?? item)
            .sort((a, b) => a.z - b.z || a.id - b.id);
        });
        break;

      case 'BackgroundChanged':
        setBackgroundState(payload as Background);
        break;

      case 'ItemUpdated':
        setItems((current) => current.map((x) => (x.id === payload.item.id ? payload.item : x)));
        break;

      case 'ItemsDeleted':
        setItems((current) => current.filter((x) => !payload.itemIds.includes(x.id)));
        break;

      case 'BoardCleared':
        if (payload.pageId !== current.current) break;
        setItems([]);
        setLive(new Map());
        break;

      case 'ItemLocked':
        setItems((current) => current.map((x) => (x.id === payload.itemId ? { ...x, lockedBy: payload.by } : x)));
        break;

      case 'ItemUnlocked':
        setItems((current) => current.map((x) => (x.id === payload.itemId ? { ...x, lockedBy: null } : x)));
        break;

      case 'MemberJoined':
        setParticipants((current) => [
          ...current.filter((x) => x.connectionId !== payload.connectionId),
          payload as Participant,
        ]);
        break;

      case 'MemberLeft':
        setParticipants((current) => current.filter((x) => x.connectionId !== payload.connectionId));
        setCursors((current) => current.filter((x) => x.id !== payload.connectionId));
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (!Number.isFinite(boardId)) return;

    const token = readToken();

    const hub = new HubConnectionBuilder()
      .withUrl(`${API_URL}/hub/board${token ? `?access_token=${encodeURIComponent(token)}` : ''}`)
      // Паузы нарастают, но остаются короткими: требование — пережить
      // обрыв в тридцать секунд, а не подождать минуту до первой попытки.
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 15000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.current = hub;

    const join = async () => {
      await hub.invoke('JoinBoard', boardId, readGuestToken(boardId), seq.current);
    };

    // Каждое событие приходит вместе со своим номером — запоминаем его,
    // чтобы было чем догоняться после обрыва.
    const handled = [
      'ItemBegan', 'ItemPoints', 'ItemCommitted', 'ItemCancelled', 'ItemUpdated',
      'ItemsMoved', 'ItemsReordered', 'ItemsDeleted', 'BoardCleared', 'ItemLocked', 'ItemUnlocked',
      'MemberJoined', 'MemberLeft', 'BackgroundChanged',
    ];

    // «Страницы изменились» в журнал не пишется и номера не имеет: это
    // не изменение доски, а повод перечитать полосу.

    for (const name of handled) {
      hub.on(name, (payload: unknown, eventSeq: number) => {
        if (typeof eventSeq === 'number') seq.current = Math.max(seq.current, eventSeq);
        apply(name, payload);
      });
    }

    hub.on('Cursors', (frame: Cursor[]) => setCursors(frame));

    hub.on('Joined', (payload: JoinedPayload) => {
      seq.current = payload.seq;
      current.current = payload.pageId ?? null;
      setPages(payload.pages ?? []);
      setPageId(payload.pageId ?? null);
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
      setItems(payload.items);
      setParticipants(payload.participants);
      setBackgroundState(payload.background ?? DEFAULT_BACKGROUND);
      setLive(new Map());
      setRecording(payload.recording ?? null);
      setMe(hub.connectionId);
      setStatus('ready');
      setError(null);
    });

    hub.on('Resumed', (payload: ResumedPayload) => {
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
      setParticipants(payload.participants);
      setRecording(payload.recording ?? null);
      setMe(hub.connectionId);

      for (const event of payload.events) apply(event.name, event.payload);

      seq.current = payload.seq;
      setStatus('ready');
      setError(null);
    });

    hub.on('Pages', (payload: { pages: BoardPageInfo[] }) => {
      const fresh = payload.pages ?? [];
      setPages(fresh);

      // Страницу, на которой мы стояли, могли удалить или закрыть от нас.
      // Оставаться на ней нельзя: рисовать на ней уже не дадут, а понять
      // это по молчанию невозможно.
      const stillThere = fresh.some((page) => page.id === current.current);
      if (stillThere) return;

      const next = fresh[0];

      if (next) {
        void hub.invoke('OpenPage', next.id).catch(() => undefined);
      } else {
        current.current = null;
        setPageId(null);
        setItems([]);
        setLive(new Map());
      }
    });

    // Страницы у кого-то изменились. Список забирает каждый сам: у
    // каждого он свой, и рассылать один на всех нельзя — спрятанная
    // страница не должна быть видна даже названием.
    hub.on('PagesChanged', () => {
      void hub.invoke('Pages').catch(() => undefined);
    });

    hub.on('PageOpened', (payload: { pageId: number; items: BoardItem[] }) => {
      current.current = payload.pageId;
      setPageId(payload.pageId);
      setItems(payload.items);
      setLive(new Map());
    });

    hub.on('Synced', (payload: SyncedPayload) => {
      // Состояние от сервера заменяет местное целиком: в этом и смысл —
      // разойтись они могли как угодно, и склеивать их было бы гаданием.
      seq.current = payload.seq;
      current.current = payload.pageId;
      setPageId(payload.pageId);
      setItems(payload.items);
      setParticipants(payload.participants);
      setBackgroundState(payload.background ?? DEFAULT_BACKGROUND);
      setLive(new Map());
      setRecording(payload.recording ?? null);
    });

    hub.on('Error', (_code: string, message: string) => setError(message));

    // Права поменял владелец, пока мы уже на доске, — сразу, без ожидания
    // обрыва связи и переподключения.
    hub.on('RoleChanged', (payload: { role: BoardRole; canEdit: boolean; canManage: boolean }) => {
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
    });

    // Выгнали или забанили прямо сейчас — дальше рисовать нечем: сервер
    // всё равно откажет на следующей же правке. Соединение можно не
    // закрывать самим: страница покажет отдельный экран и без него.
    hub.on('Removed', (payload: RemovedInfo) => setRemoved(payload));

    // Ведущий позвал к себе — страница, точка в её центре и его масштаб.
    hub.on('BroughtToMe', (payload: { pageId: number; x: number; y: number; scale: number }) => (
      setBroughtToMe({ ...payload, at: Date.now() })
    ));

    // Запись занятия — знать нужно любому на доске, не только тому, кто её ведёт.
    hub.on('RecordingStarted', (payload: { id: number; title: string | null; startedAt: string }) => (
      setRecording({ id: payload.id, title: payload.title, status: 'recording' })
    ));
    hub.on('RecordingPaused', () => setRecording((current) => (current ? { ...current, status: 'paused' } : current)));
    hub.on('RecordingResumed', () => (
      setRecording((current) => (current ? { ...current, status: 'recording' } : current))
    ));
    hub.on('RecordingStopped', () => setRecording(null));

    hub.onreconnecting(() => setStatus('reconnecting'));

    hub.onreconnected(async () => {
      await join();
      // Догон по журналу мог не покрыть разрыв целиком — доспрашиваем
      // состояние: лишний запрос дешевле пропавшего рисунка.
      if (current.current !== null) await hub.invoke('Sync', current.current).catch(() => undefined);
    });

    hub.onclose(() => setStatus('failed'));

    // Вкладка вернулась из фона. Браузер там приглушает и таймеры, и
    // сокет, поэтому доверять тому, что успело дойти, нельзя.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (hub.state !== HubConnectionState.Connected) return;
      if (current.current !== null) void hub.invoke('Sync', current.current).catch(() => undefined);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    hub.start()
      .then(join)
      .catch(() => {
        setStatus('failed');
        setError('Не удалось подключиться к доске.');
      });

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      connection.current = null;
      void hub.stop();
    };
  }, [boardId, apply]);

  /** Вызов хаба, если связь есть. Без связи молчим: рисование продолжается локально. */
  const call = useCallback((method: string, ...args: unknown[]) => {
    const hub = connection.current;
    if (hub?.state === HubConnectionState.Connected) void hub.invoke(method, ...args).catch(() => undefined);
  }, []);

  /**
   * Номер открытой страницы для вызовов хаба. Сервер сверяет его с
   * правами при каждом изменении: без открытой страницы менять нечего.
   */
  const page = () => current.current ?? 0;

  return {
    status, error, role, canEdit, canManage, removed, broughtToMe, recording,
    items, live, participants, cursors, me, commits, background,
    pages, pageId,
    sendCursor: useCallback((x: number, y: number) => call('Cursor', x, y), [call]),
    beginItem: useCallback((id, type, data) => call('BeginItem', id, page(), type, data), [call]),
    appendPoints: useCallback((id, points) => call('AppendPoints', id, page(), points), [call]),
    commitItem: useCallback(
      (id, type, data, imageRef, pageId) => (
        call('CommitItem', id, pageId ?? page(), type, data, imageRef ?? null)
      ),
      [call],
    ),
    cancelItem: useCallback((id: string) => call('CancelItem', id, page()), [call]),
    setBackground: useCallback((next: Background) => (
      call('SetBackground', next.background, next.gridStyle, next.gridColor)
    ), [call]),
    moveItems: useCallback(
      (ids: number[], dx: number, dy: number) => call('MoveItems', ids, page(), dx, dy), [call],
    ),
    updateItem: useCallback((id: number, data: ItemData) => call('UpdateItem', id, page(), data), [call]),
    reorder: useCallback((ids: number[], toFront: boolean) => call('Reorder', ids, page(), toFront), [call]),
    deleteItems: useCallback((ids: number[]) => call('DeleteItems', ids, page()), [call]),
    clearBoard: useCallback(() => call('ClearBoard', page()), [call]),

    openPage: useCallback((id: number) => call('OpenPage', id), [call]),
    addPage: useCallback((title?: string) => call('AddPage', title ?? null), [call]),
    pageItems: useCallback(async (id: number) => {
      const hub = connection.current;
      if (hub?.state !== HubConnectionState.Connected) return [];

      try {
        const answer = await hub.invoke<{ items: BoardItem[] } | null>('PageItems', id);
        return answer?.items ?? [];
      } catch {
        return [];
      }
    }, []),
    addPageNow: useCallback(async (title: string) => {
      const hub = connection.current;
      if (hub?.state !== HubConnectionState.Connected) return null;

      try {
        return await hub.invoke<number | null>('AddPage', title);
      } catch {
        return null;
      }
    }, []),
    renamePage: useCallback((id: number, title: string) => call('RenamePage', id, title), [call]),
    deletePage: useCallback((id: number) => call('DeletePage', id), [call]),
    reorderPages: useCallback((order: number[]) => call('ReorderPages', order), [call]),
    setPageVisibility: useCallback(
      (id: number, visibility: PageVisibility, viewers: string[]) => (
        call('SetPageVisibility', id, visibility, viewers)
      ),
      [call],
    ),

    bringEveryone: useCallback(
      (id: number, x: number, y: number, scale: number) => call('BringEveryone', id, x, y, scale),
      [call],
    ),

    startRecording: useCallback((title?: string) => call('StartRecording', title ?? null), [call]),
    pauseRecording: useCallback(() => call('PauseRecording'), [call]),
    resumeRecording: useCallback(() => call('ResumeRecording'), [call]),
    stopRecording: useCallback(() => call('StopRecording'), [call]),
    reportViewport: useCallback(
      (id: number, x: number, y: number, scale: number) => call('ReportViewport', id, x, y, scale),
      [call],
    ),
  };
}
