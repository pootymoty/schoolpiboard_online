import { useCallback, useEffect, useRef, useState } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { API_URL, readToken } from '../api/client';
import { translate } from './geometry';
import { readGuestToken } from '../api/guest';
import type { BoardRole } from '../api/types';
import type {
  BoardItem, Cursor, ItemData, ItemType, JoinedPayload, LiveStroke, Participant,
  ResumedPayload, SyncedPayload,
} from './protocol';

export type HubStatus = 'connecting' | 'ready' | 'reconnecting' | 'failed';

export interface BoardHub {
  status: HubStatus;
  error: string | null;
  role: BoardRole | null;
  canEdit: boolean;
  canManage: boolean;
  items: BoardItem[];
  /** Чужие штрихи, которые рисуются прямо сейчас. */
  live: Map<string, LiveStroke>;
  participants: Participant[];
  cursors: Cursor[];
  /** Наш идентификатор подключения — чтобы не рисовать собственный курсор. */
  me: string | null;
  /** Последний закреплённый объект: по нему свой штрих узнаёт свой номер. */
  lastCommit: { tempId: string; itemId: number } | null;

  sendCursor: (x: number, y: number) => void;
  beginItem: (tempId: string, type: ItemType, data: ItemData) => void;
  appendPoints: (tempId: string, points: ItemData['points']) => void;
  commitItem: (tempId: string, type: ItemType, data: ItemData) => void;
  cancelItem: (tempId: string) => void;
  moveItems: (ids: number[], dx: number, dy: number) => void;
  deleteItems: (ids: number[]) => void;
  clearBoard: () => void;
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
  const [items, setItems] = useState<BoardItem[]>([]);
  const [live, setLive] = useState<Map<string, LiveStroke>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [lastCommit, setLastCommit] = useState<{ tempId: string; itemId: number } | null>(null);

  const connection = useRef<HubConnection | null>(null);
  const seq = useRef(0);

  /** Применяет одно событие доски — и живое, и добранное после обрыва. */
  const apply = useCallback((name: string, payload: any) => {
    switch (name) {
      case 'ItemBegan':
        setLive((current) => new Map(current).set(payload.tempId, payload as LiveStroke));
        break;

      case 'ItemPoints':
        setLive((current) => {
          const stroke = current.get(payload.tempId);
          if (!stroke) return current;

          const next = new Map(current);
          next.set(payload.tempId, {
            ...stroke,
            data: { ...stroke.data, points: [...(stroke.data.points ?? []), ...payload.points] },
          });
          return next;
        });
        break;

      case 'ItemCancelled':
        setLive((current) => {
          const next = new Map(current);
          next.delete(payload.tempId);
          return next;
        });
        break;

      case 'ItemCommitted':
        // Штрих переезжает из «рисуется» в «нарисовано» — двумя действиями
        // сразу, иначе между ними он мигнул бы, пропав из обоих списков.
        setLive((current) => {
          const next = new Map(current);
          next.delete(payload.tempId);
          return next;
        });
        setItems((current) => [...current.filter((x) => x.id !== payload.item.id), payload.item]);
        setLastCommit({ tempId: payload.tempId, itemId: payload.item.id });
        break;

      case 'ItemsMoved':
        setItems((current) => current.map((item) => (
          payload.itemIds.includes(item.id) ? { ...item, data: translate(item.data, payload.dx, payload.dy) } : item
        )));
        break;

      case 'ItemUpdated':
        setItems((current) => current.map((x) => (x.id === payload.item.id ? payload.item : x)));
        break;

      case 'ItemsDeleted':
        setItems((current) => current.filter((x) => !payload.itemIds.includes(x.id)));
        break;

      case 'BoardCleared':
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
      'ItemsMoved', 'ItemsDeleted', 'BoardCleared', 'ItemLocked', 'ItemUnlocked',
      'MemberJoined', 'MemberLeft',
    ];

    for (const name of handled) {
      hub.on(name, (payload: unknown, eventSeq: number) => {
        if (typeof eventSeq === 'number') seq.current = Math.max(seq.current, eventSeq);
        apply(name, payload);
      });
    }

    hub.on('Cursors', (frame: Cursor[]) => setCursors(frame));

    hub.on('Joined', (payload: JoinedPayload) => {
      seq.current = payload.seq;
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
      setItems(payload.items);
      setParticipants(payload.participants);
      setLive(new Map());
      setMe(hub.connectionId);
      setStatus('ready');
      setError(null);
    });

    hub.on('Resumed', (payload: ResumedPayload) => {
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
      setParticipants(payload.participants);
      setMe(hub.connectionId);

      for (const event of payload.events) apply(event.name, event.payload);

      seq.current = payload.seq;
      setStatus('ready');
      setError(null);
    });

    hub.on('Synced', (payload: SyncedPayload) => {
      // Состояние от сервера заменяет местное целиком: в этом и смысл —
      // разойтись они могли как угодно, и склеивать их было бы гаданием.
      seq.current = payload.seq;
      setItems(payload.items);
      setParticipants(payload.participants);
      setLive(new Map());
    });

    hub.on('Error', (_code: string, message: string) => setError(message));

    hub.onreconnecting(() => setStatus('reconnecting'));

    hub.onreconnected(async () => {
      await join();
      // Догон по журналу мог не покрыть разрыв целиком — доспрашиваем
      // состояние: лишний запрос дешевле пропавшего рисунка.
      await hub.invoke('Sync').catch(() => undefined);
    });

    hub.onclose(() => setStatus('failed'));

    // Вкладка вернулась из фона. Браузер там приглушает и таймеры, и
    // сокет, поэтому доверять тому, что успело дойти, нельзя.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (hub.state !== HubConnectionState.Connected) return;
      void hub.invoke('Sync').catch(() => undefined);
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

  return {
    status, error, role, canEdit, canManage, items, live, participants, cursors, me, lastCommit,
    sendCursor: useCallback((x: number, y: number) => call('Cursor', x, y), [call]),
    beginItem: useCallback((id, type, data) => call('BeginItem', id, type, data), [call]),
    appendPoints: useCallback((id, points) => call('AppendPoints', id, points), [call]),
    commitItem: useCallback((id, type, data) => call('CommitItem', id, type, data), [call]),
    cancelItem: useCallback((id: string) => call('CancelItem', id), [call]),
    moveItems: useCallback((ids: number[], dx: number, dy: number) => call('MoveItems', ids, dx, dy), [call]),
    deleteItems: useCallback((ids: number[]) => call('DeleteItems', ids), [call]),
    clearBoard: useCallback(() => call('ClearBoard'), [call]),
  };
}
