import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Point } from './protocol';
import type { TextSettings } from './tools';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';

interface Props {
  at: Point;
  viewport: Viewport;
  /** Габариты холста: поле не должно уезжать за его край. */
  bounds: { width: number; height: number };
  settings: TextSettings;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/** Пока не набрано ничего — поле в несколько знаков, а не во весь холст. */
const MIN_WIDTH = 96;

/**
 * Поле ввода надписи поверх холста.
 *
 * Размер шрифта поля подстраивается под масштаб: набранное должно
 * выглядеть ровно так же, как ляжет на доску, иначе на мелком масштабе
 * человек набирает текст втрое крупнее задуманного.
 *
 * Поле начинается маленьким и растёт под содержимое — и вширь, и вниз.
 * Широкое поле по умолчанию не даёт понять, где на доске окажется
 * надпись: оно занимает всё, куда она могла бы попасть.
 */
export function TextInput({ at, viewport, bounds, settings, onCommit, onCancel }: Props): ReactElement {
  const [value, setValue] = useState('');
  const [size, setSize] = useState({ width: MIN_WIDTH, height: 0 });
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => field.current?.focus(), []);

  const screen = toScreen(viewport, at.x, at.y);
  const fontSize = Math.max(16, settings.fontSize * viewport.scale);

  // Предел ширины — до правого края холста: дальше надпись всё равно
  // не поместится, и перенос строки происходит здесь же.
  const maxWidth = Math.max(MIN_WIDTH, bounds.width - screen.x - 16);

  // Меряем в том же шрифте, которым рисуем: ширина по числу знаков
  // разошлась бы с настоящей на первой же прописной букве.
  useLayoutEffect(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;

    context.font = `${fontSize}px Manrope, system-ui, sans-serif`;

    const lines = value.split('\n');
    const widest = Math.max(...lines.map((line) => context.measureText(line).width), 0);

    const width = Math.min(maxWidth, Math.max(MIN_WIDTH, widest + fontSize));

    // Высоту берём у самого поля: оно уже знает, сколько строк вышло
    // после переноса по этой ширине.
    const element = field.current;
    if (element) {
      element.style.height = 'auto';
      setSize({ width, height: element.scrollHeight });
    } else {
      setSize({ width, height: fontSize * 1.25 });
    }
  }, [value, fontSize, maxWidth]);

  return (
    <textarea
      ref={field}
      className="text-input"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        // Enter закрепляет, Shift+Enter переносит строку: надпись на доске
        // чаще в одну строку, и лишнее нажатие тут было бы данью привычке.
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onCommit(value);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      style={{
        left: screen.x,
        top: screen.y,
        width: size.width,
        height: size.height || undefined,
        color: settings.color,
        fontSize,
        lineHeight: 1.25,
      }}
      placeholder="Текст"
    />
  );
}
