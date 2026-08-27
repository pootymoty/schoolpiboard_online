import { useEffect, useRef, useState } from 'react';
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

/**
 * Поле ввода надписи поверх холста.
 *
 * Размер шрифта поля подстраивается под масштаб: набранное должно
 * выглядеть ровно так же, как ляжет на доску, иначе на мелком масштабе
 * человек набирает текст втрое крупнее задуманного.
 */
export function TextInput({ at, viewport, bounds, settings, onCommit, onCancel }: Props): ReactElement {
  const [value, setValue] = useState('');
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => field.current?.focus(), []);

  // Поле растёт под содержимое: фиксированная высота прятала бы вторую
  // строку, а прокрутка внутри крошечного поля неудобна вовсе.
  useEffect(() => {
    const element = field.current;
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value, settings.fontSize, viewport.scale]);

  const raw = toScreen(viewport, at.x, at.y);
  const size = settings.fontSize * viewport.scale;

  // Прижимаем к видимой области: ткнув у правого края, человек иначе
  // печатал бы в поле, которого не видно.
  const width = Math.max(120, Math.min(320, bounds.width - 16));
  const screen = {
    x: Math.max(8, Math.min(raw.x, bounds.width - width - 8)),
    y: Math.max(8, Math.min(raw.y, bounds.height - size * 2 - 8)),
  };

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
        width,
        color: settings.color,
        // Не мельче шестнадцати: на iOS поле с мелким шрифтом заставляет
        // браузер подтягивать к нему всю страницу.
        fontSize: Math.max(16, size),
        lineHeight: 1.25,
      }}
      rows={1}
      placeholder="Текст"
    />
  );
}
