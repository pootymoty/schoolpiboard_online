import type { BoardItem, Background } from './protocol';
import { boundsOf } from './geometry';
import { preload } from './images';
import { drawItem } from './render';

/** Поля вокруг содержимого, чтобы штрихи не упирались в край. */
const PADDING = 32;

/**
 * Наибольшая сторона отрисованной страницы.
 *
 * Доска бесконечна, и занятие на ней может растянуться на десятки тысяч
 * единиц. Без предела такая страница превратилась бы в холст, который
 * браузер отказывается создавать, — а в письме от него всё равно нужен
 * лист, который открывается.
 */
const MAX_SIDE = 4000;

/**
 * Рисует содержимое страницы на отдельном холсте.
 *
 * Берётся область содержимого, а не то, что видно на экране: у двоих
 * разные окна и разный масштаб, и «как вижу» означало бы у каждого своё.
 */
export async function renderBoard(
  items: BoardItem[], background: Background,
): Promise<HTMLCanvasElement | null> {
  const bounds = boundsOf(items);
  if (!bounds) return null;

  // Картинки могли ещё не догрузиться: на холсте это пустая рамка, а в
  // сохранённом файле было бы белое пятно вместо страницы учебника.
  await preload(items.map((item) => item.imageRef).filter((ref): ref is string => Boolean(ref)));

  const width = bounds.width + PADDING * 2;
  const height = bounds.height + PADDING * 2;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = background.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Сдвигаем мир так, чтобы содержимое легло в поля.
  context.scale(scale, scale);
  context.translate(PADDING - bounds.x, PADDING - bounds.y);
  for (const item of items) drawItem(context, item.type, item.data, item.imageRef);

  return canvas;
}

/** Сохраняет доску картинкой на диск. */
export async function exportPng(
  items: BoardItem[], background: Background, title: string,
): Promise<boolean> {
  const canvas = await renderBoard(items, background);
  if (!canvas) return false;

  const link = document.createElement('a');
  link.download = `${title || 'Доска'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();

  return true;
}
