import type { ReactElement } from 'react';
import type { Timer } from './useTimer';
import { TIMER_MAX_MINUTES } from './useTimer';

interface Props {
  timer: Timer;
  onClose: () => void;
}

/** Число из поля ввода: пустое поле — ноль, а не «не число». */
function clamp(raw: string, limit: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(limit, value)) : 0;
}

/**
 * Таймер занятия — здесь только отображение и поля ввода. Сам отсчёт
 * живёт в {@link Timer} у вызывающего: «Готово» здесь закрывает панель,
 * а не выключает таймер, и при следующем открытии он покажет то же
 * время, что натикало без панели на экране.
 */
export function TimerPanel({ timer, onClose }: Props): ReactElement {
  const { total, left, running, done, set, toggle } = timer;

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
            max={TIMER_MAX_MINUTES}
            value={minutes}
            onChange={(event) => set(clamp(event.target.value, TIMER_MAX_MINUTES) * 60 + seconds)}
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
        onClick={toggle}
        disabled={left === 0}
        style={{ marginTop: 'var(--sp-2)' }}
      >
        {running ? 'Пауза' : 'Пуск'}
      </button>
    </div>
  );
}
