import { useCallback, useEffect, useState } from 'react';
import { listSummaryRequests } from '../api/summary';
import type { SummaryRequest } from '../api/summary';

/**
 * Как часто владелец проверяет, не попросил ли кто конспект.
 *
 * Реже, чем очередь ожидания: там человек стоит за дверью и ждёт ответа
 * сейчас, а конспект подождёт до конца занятия.
 */
const POLL_MS = 20000;

export interface SummaryQueue {
  requests: SummaryRequest[];
  reload: () => Promise<void>;
  forget: (requestId: number) => void;
}

/**
 * Просьбы прислать конспект — у владельца доски.
 *
 * Опрос живёт на уровне страницы, а не внутри панели: иначе о просьбе
 * можно было бы узнать, только если и так о ней знаешь.
 */
export function useSummaryRequests(boardId: number, canManage: boolean): SummaryQueue {
  const [requests, setRequests] = useState<SummaryRequest[]>([]);

  const reload = useCallback(async () => {
    if (!canManage) return;

    try {
      setRequests(await listSummaryRequests(boardId));
    } catch {
      // Не главное на странице: молчим и пробуем снова.
    }
  }, [boardId, canManage]);

  useEffect(() => {
    if (!canManage) {
      setRequests([]);
      return;
    }

    void reload();
    const timer = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [canManage, reload]);

  const forget = useCallback((requestId: number) => {
    setRequests((current) => current.filter((one) => one.id !== requestId));
  }, []);

  return { requests, reload, forget };
}
