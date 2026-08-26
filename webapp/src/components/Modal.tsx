import { useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Всплывающее окно.
 *
 * Всё, что нужно изредка — ссылка на доску, переименование, — живёт здесь,
 * а не на странице: на доске рисуют, и постоянные панели отнимали бы место
 * у холста.
 */
export function Modal({ title, onClose, children }: Props): ReactElement {
  const backdrop = useRef<HTMLDivElement | null>(null);

  // Escape закрывает окно: без этого единственный выход — попасть мышью
  // в крестик, а на доске руки заняты пером.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal__backdrop"
      ref={backdrop}
      // Закрываем только по щелчку мимо окна. Проверка на сам фон нужна,
      // иначе окно закрывалось бы, когда внутри отпускают кнопку мыши
      // после выделения текста.
      onMouseDown={(event) => {
        if (event.target === backdrop.current) onClose();
      }}
      role="presentation"
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row row--between">
          <h2 className="modal__title">{title}</h2>
          <button className="btn-tool" type="button" onClick={onClose} aria-label="Закрыть">
            <IconClose />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
