import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { getRecording } from '../api/recordings';
import type { RecordingInfo, RecordingStep } from '../api/recordings';
import { ApiError } from '../api/client';
import { applyRecordedStep, EMPTY_PLAYBACK } from './replay';
import type { PlaybackState } from './replay';
import { pointsOf } from './geometry';
import { drawGrid, drawItem } from './render';
import { fitToContent } from './viewport';
import type { BoardItem } from './protocol';

interface Props {
  boardId: number;
  recordingId: number;
  onClose: () => void;
}

/** Минуты:секунды — для перемотки важна секунда, а не более точное деление. */
function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Воспроизведение записи занятия.
 *
 * Вид не двигают руками — холст сам подгоняет масштаб под то, что на
 * нём есть в текущий момент перемотки: это просмотр хода решения, а не
 * рабочая доска, лишний пан и зум здесь только мешал бы.
 */
export function RecordingPlayer({ boardId, recordingId, onClose }: Props): ReactElement {
  const [recording, setRecording] = useState<RecordingInfo | null>(null);
  const [steps, setSteps] = useState<RecordingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;

    getRecording(boardId, recordingId)
      .then((answer) => {
        if (!alive) return;
        setRecording(answer.recording);
        setSteps(answer.steps);
      })
      .catch((reason) => {
        if (!alive) return;
        setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть запись.');
      });

    return () => { alive = false; };
  }, [boardId, recordingId]);

  const duration = recording?.durationMs ?? 0;

  // Воспроизведение — от отметки времени, тем же приёмом, что и у
  // таймера занятия: так пауза вкладки в фоне не тормозит счёт.
  const startedFrom = useRef<{ realAt: number; offsetAt: number } | null>(null);

  useEffect(() => {
    if (!playing) return;

    startedFrom.current = { realAt: performance.now(), offsetAt: offsetMs };
    let frame = 0;

    const tick = () => {
      const base = startedFrom.current;
      if (!base) return;

      const next = base.offsetAt + (performance.now() - base.realAt);

      if (next >= duration) {
        setOffsetMs(duration);
        setPlaying(false);
        return;
      }

      setOffsetMs(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // offsetMs намеренно не в зависимостях: обновляется самим тиком, и
    // перечисление его здесь пересоздавало бы отсчёт на каждый кадр.
  }, [playing, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Содержимое на текущий момент перемотки.
   *
   * Кэш в ref: вперёд — донакапливаем шаги, назад — складываем заново с
   * начала. Без этого каждый кадр воспроизведения пересобирал бы всю
   * запись целиком, а не только новый кусок.
   */
  const cache = useRef<{ index: number; state: PlaybackState }>({ index: 0, state: EMPTY_PLAYBACK });

  if ((steps[cache.current.index - 1]?.offsetMs ?? -1) > offsetMs) {
    cache.current = { index: 0, state: EMPTY_PLAYBACK };
  }

  while (cache.current.index < steps.length && steps[cache.current.index].offsetMs <= offsetMs) {
    const step = steps[cache.current.index];
    cache.current = {
      index: cache.current.index + 1,
      state: applyRecordedStep(cache.current.state, step.name, step.payload),
    };
  }

  const content = cache.current.state;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;

    const width = box.clientWidth;
    const height = box.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.fillStyle = content.background.background;
    context.fillRect(0, 0, width, height);

    // Чужой штрих, который ещё рисуется в этот момент записи, — тоже
    // объект для отрисовки, просто без своего номера: тот появится
    // только когда штрих закрепится.
    const liveItems: BoardItem[] = Array.from(content.live.values()).map((stroke) => ({
      id: -1, type: stroke.type, z: 0, data: stroke.data, imageRef: null, lockedBy: null,
    }));

    const all = [...content.items, ...liveItems];
    const points = all.flatMap((item) => pointsOf(item.data));
    const viewport = fitToContent(points, width, height) ?? { x: width / 2, y: height / 2, scale: 1 };

    drawGrid(
      context, content.background.gridStyle, content.background.gridColor, width, height,
      viewport.x, viewport.y, viewport.scale,
    );

    context.save();
    context.translate(viewport.x, viewport.y);
    context.scale(viewport.scale, viewport.scale);
    for (const item of all) drawItem(context, item.type, item.data, item.imageRef);
    context.restore();
  }, [content]);

  return (
    <div className="params params--right params--tall" role="dialog" aria-label="Воспроизведение записи">
      <div className="params__head">
        <span className="params__title">{recording?.title || 'Запись занятия'}</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      {error ? <p className="library__hint library__note">{error}</p> : null}

      <div className="player__canvas" ref={boxRef}>
        <canvas ref={canvasRef} />
      </div>

      <div className="params__row player__scrub">
        <span className="text-muted small">{formatTime(offsetMs)}</span>
        <input
          className="player__range"
          type="range"
          min={0}
          max={Math.max(1, duration)}
          value={Math.min(offsetMs, duration)}
          onChange={(event) => { setPlaying(false); setOffsetMs(Number(event.target.value)); }}
        />
        <span className="text-muted small">{formatTime(duration)}</span>
      </div>

      <button
        className="btn-primary btn-block"
        type="button"
        disabled={!recording || duration === 0}
        onClick={() => setPlaying((current) => !current)}
      >
        {playing ? 'Пауза' : 'Воспроизвести'}
      </button>
    </div>
  );
}
