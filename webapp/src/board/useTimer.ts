import { useCallback, useEffect, useRef, useState } from 'react';

export const TIMER_MAX_MINUTES = 180;

export interface Timer {
  total: number;
  left: number;
  running: boolean;
  done: boolean;
  set: (seconds: number) => void;
  toggle: () => void;
}

/**
 * Таймер занятия.
 *
 * Живёт всё время, что открыта доска, а не только пока открыта его
 * панель: закрыв панель, чтобы порисовать, отсчёт не должен ни сбиться на
 * ноль, ни остановиться. Поэтому состояние здесь, в отдельном хуке —
 * панель его только показывает.
 */
export function useTimer(): Timer {
  const [total, setTotal] = useState(10 * 60);
  const [left, setLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  // Отсчёт от отметки времени, а не вычитанием секунды на каждом такте:
  // приглушённая в фоне вкладка иначе отставала бы тем сильнее, чем
  // дольше на неё не смотрят.
  const endsAt = useRef(0);

  useEffect(() => {
    if (!running) return;

    endsAt.current = Date.now() + left * 1000;

    const tick = () => {
      const rest = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000));
      setLeft(rest);

      if (rest === 0) {
        setRunning(false);
        setDone(true);
      }
    };

    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
    // left намеренно не в зависимостях: он меняется каждым тактом, и
    // отсчёт перезапускался бы четыре раза в секунду.
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((seconds: number) => {
    const value = Math.max(0, Math.min(TIMER_MAX_MINUTES * 60, seconds));
    setTotal(value);
    setLeft(value);
    setRunning(false);
    setDone(false);
  }, []);

  const toggle = useCallback(() => {
    setDone(false);
    setRunning((current) => !current);
  }, []);

  return { total, left, running, done, set, toggle };
}
