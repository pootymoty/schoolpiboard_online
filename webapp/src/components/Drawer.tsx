import { useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Боковая панель, выезжающая справа.
 *
 * Для списка участников: их может быть много, а модальное окно по центру
 * перекрывало бы холст целиком. Панель у края оставляет доску видимой.
 */
export function Drawer({ title, onClose, children }: Props): ReactElement {
  const backdrop = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="drawer__backdrop"
      ref={backdrop}
      onMouseDown={(event) => {
        if (event.target === backdrop.current) onClose();
      }}
      role="presentation"
    >
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row row--between drawer__head">
          <h2 className="modal__title">{title}</h2>
          <button className="btn-tool" type="button" onClick={onClose} aria-label="Закрыть">
            <IconClose />
          </button>
        </div>

        <div className="drawer__body">{children}</div>
      </div>
    </div>
  );
}
