import type { BoardItem, Background } from './protocol';
import { boundsOf } from './geometry';
import { drawItem } from './render';

/** Поля вокруг содержимого, чтобы штрихи не упирались в край. */
const PADDING = 32;

/**
 * Сохраняет доску картинкой.
 *
 * Выгружается область содержимого, а не то, что видно на экране: у двоих
 * разные окна и разный масштаб, и «как вижу» означало бы у каждого своё.
 */
export function exportPng(items: BoardItem[], background: Background, title: string): boolean {
  const bounds = boundsOf(items);
  if (!bounds) return false;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bounds.width + PADDING * 2);
  canvas.height = Math.ceil(bounds.height + PADDING * 2);

  const context = canvas.getContext('2d');
  if (!context) return false;

  context.fillStyle = background.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Сдвигаем мир так, чтобы содержимое легло в поля.
  context.translate(PADDING - bounds.x, PADDING - bounds.y);
  for (const item of items) drawItem(context, item.type, item.data);

  const link = document.createElement('a');
  link.download = `${title || 'Доска'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();

  return true;
}
