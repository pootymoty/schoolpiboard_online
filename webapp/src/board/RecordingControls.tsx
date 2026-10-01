import type { ReactElement } from 'react';
import { IconPause, IconPlay, IconRecord, IconStop } from '../components/Icons';

interface Props {
  /** Управляет записью только владелец; остальным — метка состояния. */
  canManage: boolean;
  status: 'recording' | 'paused' | null;
  /** Идёт отсчёт «3, 2, 1» перед стартом — `null`, если нет. */
  countdown: number | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Открыть панель записей — с метки у того, кто запись не ведёт. */
  onOpen: () => void;
}

/**
 * Идущая запись — у кнопки «Участники», а не в верхней панели.
 *
 * Верхнюю панель на телефоне листают вбок и прячут целиком, и пауза со
 * стопом оказывались то за краем, то вовсе скрыты, — а идущую запись
 * должно быть видно всегда. Появляется, как только нажата «Начать
 * запись», и исчезает по стопу. Оформление то же: отсчёт — ровный
 * зелёный, идёт — мерцающий зелёный, пауза — ровный голубой.
 */
export function RecordingControls({
  canManage, status, countdown, onPause, onResume, onStop, onOpen,
}: Props): ReactElement | null {
  if (canManage && countdown !== null) {
    return (
      <span
        className="rec-group rec-group--recording rec-group--countdown rec-group--corner"
        role="status"
        aria-label={`Запись начнётся через ${countdown}`}
      >
        <span className="rec-countdown" aria-hidden="true">{countdown}</span>
      </span>
    );
  }

  if (status === null) return null;

  if (!canManage) {
    // У того, кто запись не ведёт, — одна метка того же цвета; нажатие
    // открывает панель записей.
    return (
      <span className={`rec-group rec-group--${status} rec-group--corner`}>
        <button
          className="btn-tool" type="button" onClick={onOpen}
          title={status === 'recording' ? 'Идёт запись' : 'Запись на паузе'}
        >
          {status === 'paused' ? <IconPause /> : <IconRecord />}
        </button>
      </span>
    );
  }

  return (
    <span
      className={`rec-group rec-group--${status} rec-group--corner`}
      role="group"
      aria-label={status === 'recording' ? 'Идёт запись' : 'Запись на паузе'}
    >
      {status === 'recording' ? (
        <button className="btn-tool" type="button" onClick={onPause} title="Пауза">
          <IconPause />
        </button>
      ) : (
        <button className="btn-tool" type="button" onClick={onResume} title="Продолжить">
          <IconPlay />
        </button>
      )}
      <button className="btn-tool" type="button" onClick={onStop} title="Стоп">
        <IconStop />
      </button>
    </span>
  );
}
