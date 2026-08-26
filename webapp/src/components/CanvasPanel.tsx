import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
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
export function CanvasPanel({ title, onClose, children }: Props): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="canvas-panel" role="dialog" aria-label={title}>
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
