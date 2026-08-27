import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

interface Props {
  onClose: () => void;
}

const MAX_MINUTES = 180;

/** Число из поля ввода: пустое поле — ноль, а не «не число». */
function clamp(raw: string, limit: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(limit, value)) : 0;
}

/**
 * Таймер занятия.
 *
 * Живёт только в браузере того, кто его завёл: это его способ следить за
 * временем, а не свойство доски. Общий таймер означал бы, что любой
 * участник может сбить отсчёт преподавателю.
 */
export function TimerPanel({ onClose }: Props): ReactElement {
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

  const set = (seconds: number) => {
    const value = Math.max(0, Math.min(MAX_MINUTES * 60, seconds));
    setTotal(value);
    setLeft(value);
    setRunning(false);
    setDone(false);
  };

  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const progress = total > 0 ? left / total : 0;

  return (
    <div className="params params--right timer" role="dialog" aria-label="Таймер">
      <div className="params__head">
        <span className="params__title">Таймер</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      <div className="timer__dial" style={{ ['--progress' as string]: progress }}>
        <span className="timer__value">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
      </div>

      {done ? <p className="note note-warning">Время вышло</p> : null}

      {/* Ввод числом: подобрать «семь минут» кнопками из готовых значений
          нельзя, а занятия не делятся на круглые пятёрки. */}
      <div className="timer__fields">
        <label className="timer__field">
          <span className="params__label">Мин</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_MINUTES}
            value={minutes}
            onChange={(event) => set(clamp(event.target.value, MAX_MINUTES) * 60 + seconds)}
          />
        </label>

        <label className="timer__field">
          <span className="params__label">Сек</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={seconds}
            onChange={(event) => set(minutes * 60 + clamp(event.target.value, 59))}
          />
        </label>
      </div>

      <div className="params__row timer__controls">
        <button className="btn-quiet btn-sm" type="button" onClick={() => set(left - 60)}>−1 мин</button>
        <button className="btn-quiet btn-sm" type="button" onClick={() => set(left + 60)}>+1 мин</button>
        <button className="btn-quiet btn-sm" type="button" onClick={() => set(total)}>Сброс</button>
      </div>

      <button
        className="btn-primary btn-block"
        type="button"
        onClick={() => { setDone(false); setRunning((current) => !current); }}
        disabled={left === 0}
        style={{ marginTop: 'var(--sp-2)' }}
      >
        {running ? 'Пауза' : 'Пуск'}
      </button>
    </div>
  );
}
