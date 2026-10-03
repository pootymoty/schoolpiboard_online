import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

/** Через сколько после наведения показывать: мимолётное движение мыши подсказку не вызывает. */
const SHOW_DELAY_MS = 350;

/** Отступ подсказки от кнопки и от края окна. */
const GAP = 8;

interface Tip {
  text: string;
  /** Кнопка в вертикальной полосе — подсказка справа, иначе под кнопкой. */
  side: 'right' | 'below';
  rect: DOMRect;
}

/**
 * Подсказки к кнопкам с атрибутом `data-tip` — один слой на всё приложение.
 *
 * Раньше подсказка была псевдоэлементом самой кнопки. Но кнопки живут в
 * полосах, которые прокручиваются: подсказка, выходящая за край, расширяла
 * содержимое полосы — у той появлялось место «под подсказку», и полосу
 * можно было сдвинуть вбок перетаскиванием. Здесь подсказка лежит поверх
 * всего, в фиксированном слое, и полосу не задевает вовсе.
 *
 * Только там, где наведение вообще есть: на сенсорном экране подсказка
 * вылезала бы после каждого касания и висела бы поверх холста.
 *
 * У тех же кнопок есть и `title` — на случай, если скрипт не сработал.
 * Пока на кнопку навели, `title` снимаем, иначе через секунду рядом с
 * нашей подсказкой всплывала бы вторая, системная, с тем же текстом.
 * Для скринридера название остаётся в aria-label.
 */
export function TooltipLayer(): ReactElement | null {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    let timer = 0;
    let current: HTMLElement | null = null;

    /** Убрать системную подсказку с кнопки, пока на неё наведено. */
    const muteTitle = (target: HTMLElement) => {
      const title = target.getAttribute('title');
      if (title === null) return;

      target.dataset.tipTitle = title;
      target.removeAttribute('title');
      if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', title);
    };

    const restoreTitle = (target: HTMLElement | null) => {
      const title = target?.dataset.tipTitle;
      if (!target || title === undefined) return;

      target.setAttribute('title', title);
      delete target.dataset.tipTitle;
    };

    const hide = () => {
      window.clearTimeout(timer);
      restoreTitle(current);
      current = null;
      setTip(null);
    };

    // Нажали, прокрутили — подсказка уже не к месту. Но курсор всё ещё
    // на кнопке, поэтому title не возвращаем: иначе после нажатия
    // всплыла бы системная подсказка.
    const dismiss = () => {
      window.clearTimeout(timer);
      setTip(null);
    };

    const show = (target: HTMLElement) => {
      const text = target.dataset.tip;
      if (!text || !target.isConnected) return;

      setTip({
        text,
        side: target.closest('.toolbar--vertical') ? 'right' : 'below',
        rect: target.getBoundingClientRect(),
      });
    };

    const schedule = (target: HTMLElement | null) => {
      if (target === current) return;
      hide();
      if (!target) return;

      current = target;
      muteTitle(target);
      timer = window.setTimeout(() => show(target), SHOW_DELAY_MS);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      schedule((event.target as Element | null)?.closest<HTMLElement>('[data-tip]') ?? null);
    };

    // С клавиатуры — так же, как наведение, но только для видимого фокуса:
    // щелчок мышью тоже ставит фокус, и подсказка после него была бы лишней.
    const onFocus = (event: FocusEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]') ?? null;
      if (target?.matches(':focus-visible')) schedule(target);
    };

    const onLeaveWindow = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onLeaveWindow);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('scroll', dismiss, true);
    document.addEventListener('wheel', dismiss, { capture: true, passive: true });
    window.addEventListener('resize', hide);

    return () => {
      window.clearTimeout(timer);
      restoreTitle(current);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onLeaveWindow);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('scroll', dismiss, true);
      document.removeEventListener('wheel', dismiss, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, []);

  // Ставим по месту, когда размер подсказки уже известен: у края окна её
  // сдвигаем внутрь, чтобы текст не уходил за экран.
  useLayoutEffect(() => {
    const element = box.current;
    if (!tip || !element) return;

    const { width, height } = element.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - GAP;
    const maxTop = window.innerHeight - height - GAP;

    let left: number;
    let top: number;

    if (tip.side === 'right') {
      left = tip.rect.right + GAP;
      top = tip.rect.top + tip.rect.height / 2 - height / 2;
    } else {
      // Правым краем к правому краю кнопки: верхняя полоса прижата к
      // правому краю окна, и подсказка влево помещается всегда.
      left = tip.rect.right - width;
      top = tip.rect.bottom + GAP;
    }

    element.style.left = `${Math.max(GAP, Math.min(left, maxLeft))}px`;
    element.style.top = `${Math.max(GAP, Math.min(top, maxTop))}px`;
    element.classList.add('tip-layer--shown');
  }, [tip]);

  if (!tip) return null;

  return (
    <div ref={box} className="tip-layer" role="tooltip">
      {tip.text}
    </div>
  );
}
