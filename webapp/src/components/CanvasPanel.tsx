import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

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
export function CanvasPanel({ open, title, onClose, children }: Props): ReactElement {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Панель всегда в разметке и просто уезжает за край. Появление и
  // исчезновение элемента переходом не анимируется — браузеру нечего
  // сравнивать, когда одного из состояний в дереве нет; поэтому здесь
  // переключается класс, а не монтирование.
  return (
    <aside
      className={open ? 'canvas-panel canvas-panel--open' : 'canvas-panel'}
      role="dialog"
      aria-label={title}
      aria-hidden={!open}
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
