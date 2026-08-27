import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { WaitingRequest } from '../api/types';

/** Как часто владелец проверяет, не постучался ли кто-то новый. */
const POLL_MS = 4000;

export interface WaitingQueue {
  waiting: WaitingRequest[];
  reload: () => Promise<void>;
  forget: (requestId: string) => void;
}

/**
 * Очередь ожидания у владельца доски.
 *
 * Опрос живёт на уровне страницы, а не внутри панели участников: пока он
 * был там, заявка не показывалась, пока панель не открыли — то есть
 * узнать о постучавшемся можно было, только если и так о нём знаешь.
 */
export function useWaitingQueue(boardId: number, canManage: boolean): WaitingQueue {
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);

  const reload = useCallback(async () => {
    if (!canManage) return;

    try {
      setWaiting(await api<WaitingRequest[]>(`/boards/${boardId}/waiting`));
    } catch {
      // Очередь — не главное на странице: молчим и пробуем снова.
    }
  }, [boardId, canManage]);

  useEffect(() => {
    if (!canManage) {
      setWaiting([]);
      return;
    }

    void reload();
    const timer = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [canManage, reload]);

  /** Убрать заявку сразу после решения, не дожидаясь следующего опроса. */
  const forget = useCallback((requestId: string) => {
    setWaiting((current) => current.filter((item) => item.requestId !== requestId));
  }, []);

  return { waiting, reload, forget };
}
