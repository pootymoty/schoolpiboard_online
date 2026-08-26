import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { IconMore } from './Icons';

/**
 * Меню на три точки.
 *
 * Действия над доской живут здесь, а не кнопками в строке: переименование
 * и удаление нужны изредка, а места в строке они занимают постоянно.
 */
interface Props {
  label: string;
  children: ReactNode;
  /** Свой вид кнопки-триггера вместо трёх точек — например, имя в шапке. */
  trigger?: ReactNode;
  triggerClassName?: string;
}

export function Menu({ label, children, trigger, triggerClassName = 'btn-tool' }: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  // Закрываем по щелчку мимо и по Escape. Без этого открытое меню остаётся
  // висеть, когда человек передумал и просто ткнул в сторону.
  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button
        className={triggerClassName}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-expanded={open}
      >
        {trigger ?? <IconMore />}
      </button>

      {open ? (
        // Щелчок по любому пункту закрывает меню: иначе после
        // «Переименовать» оно осталось бы поверх открывшегося окна.
        <div className="menu__list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
