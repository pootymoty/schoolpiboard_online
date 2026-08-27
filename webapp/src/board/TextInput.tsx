import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Point } from './protocol';
import type { TextSettings } from './tools';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';

interface Props {
  at: Point;
  viewport: Viewport;
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
export function TextInput({ at, viewport, settings, onCommit, onCancel }: Props): ReactElement {
  const [value, setValue] = useState('');
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => field.current?.focus(), []);

  const screen = toScreen(viewport, at.x, at.y);

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
        color: settings.color,
        fontSize: settings.fontSize * viewport.scale,
        lineHeight: 1.25,
      }}
      rows={1}
      placeholder="Текст"
    />
  );
}
