import type { ReactElement } from 'react';

/**
 * Знак «Пи» — тот же персонаж, что и в фавиконке, но с прозрачным фоном:
 * стоит прямо в строке текста, а не в цветном квадрате. Размер задаётся
 * через `em`, чтобы знак масштабировался вместе со шрифтом в каждом
 * месте, где он встречается, — от крупного заголовка до пункта меню.
 */
export function PiMark(): ReactElement {
  return <img src="/pi-mark.png" alt="Пи" className="pi-mark" />;
}

/** «Школа Пи» с изображением вместо буквы — так называется вторая программа автора. */
export function SchoolPiLabel(): ReactElement {
  return <>Школа <PiMark /></>;
}
