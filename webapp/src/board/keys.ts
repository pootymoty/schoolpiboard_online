/**
 * Какая буква нажата — независимо от раскладки и от того, кто нажимает.
 *
 * Обычная клавиатура сообщает место клавиши в `event.code` ('KeyP') — оно
 * одно и то же и на английской, и на русской раскладке. Но кнопки
 * графического планшета, макросы и экранные клавиатуры часто шлют
 * нажатие без места: `code` пустой, а `key` зависит от раскладки (на
 * русской вместо «p» придёт «з»). Тогда смотрим на `keyCode` — номер
 * виртуальной клавиши, он от раскладки не зависит, — и в последнюю
 * очередь переводим русскую букву в английскую по месту на клавиатуре.
 */
const RU = 'йцукенгшщзфывапролдячсмить';
const EN = 'qwertyuiopasdfghjklzxcvbnm';

export function letterOf(event: KeyboardEvent): string | null {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);

  if (event.keyCode >= 65 && event.keyCode <= 90) return String.fromCharCode(event.keyCode);

  const key = (event.key ?? '').toLowerCase();
  if (key.length !== 1) return null;
  if (key >= 'a' && key <= 'z') return key.toUpperCase();

  const index = RU.indexOf(key);
  return index >= 0 ? EN[index].toUpperCase() : null;
}

/** Пробел — по месту или по символу (у эмулированного нажатия места нет). */
export const isSpace = (event: KeyboardEvent): boolean => event.code === 'Space' || event.key === ' ';

/** Delete или Backspace. */
export const isDelete = (event: KeyboardEvent): boolean => (
  event.code === 'Delete' || event.code === 'Backspace' || event.key === 'Delete' || event.key === 'Backspace'
);

/** Escape. */
export const isEscape = (event: KeyboardEvent): boolean => event.code === 'Escape' || event.key === 'Escape';
