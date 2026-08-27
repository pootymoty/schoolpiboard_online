import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Столько же, сколько длится выезд в CSS. */
const ANIMATION_MS = 180;

/**
 * Панель поверх холста, у правого края.
 *
 * Не сдвигает содержимое: холст — рабочая поверхность, и если он будет
 * менять ширину при каждом открытии списка участников, нарисованное
 * поедет под руками.
 *
 * Затемнения позади нет намеренно. Затемнение говорит «сначала закрой
 * меня», а список участников открыт ровно затем, чтобы поглядывать в него,
 * не прекращая работать. Закрывается крестиком, той же кнопкой на панели
 * инструментов и клавишей Escape.
 */
export function CanvasPanel({ open, title, onClose, children }: Props): ReactElement | null {
  // Панель переживает закрытие на время анимации: убрать её из разметки
  // сразу — значит показать исчезновение вместо уезда.
  const [mounted, setMounted] = useState(open);
  const timer = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);

    if (open) {
      setMounted(true);
      return;
    }

    timer.current = window.setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => window.clearTimeout(timer.current);
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  return (
    <aside
      className={open ? 'canvas-panel' : 'canvas-panel canvas-panel--closing'}
      role="dialog"
      aria-label={title}
    >
      <div className="canvas-panel__head">
        <h2 className="canvas-panel__title">{title}</h2>
        <button className="btn-tool" type="button" onClick={onClose} aria-label="Закрыть">
          <IconClose />
        </button>
      </div>

      <div className="canvas-panel__body">{children}</div>
    </aside>
  );
}
