import { imageUrl } from '../api/files';

/**
 * Загруженные картинки доски.
 *
 * Кэш общий на всё приложение и живёт, пока открыта вкладка: холст
 * перерисовывается десятки раз в секунду, и создавать `Image` на каждый
 * кадр значило бы дёргать сеть без конца.
 *
 * Пока картинка грузится, рисовать нечего — вместо неё показывается
 * рамка-заглушка, а по загрузке холст просят перерисоваться.
 */
const cache = new Map<string, HTMLImageElement>();

/** Кого разбудить, когда очередная картинка догрузилась. */
const listeners = new Set<() => void>();

export function onImageLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Готовая к отрисовке картинка или null, если она ещё грузится. */
export function imageFor(ref: string): HTMLImageElement | null {
  const found = cache.get(ref);

  if (found) {
    return found.complete && found.naturalWidth > 0 ? found : null;
  }

  const image = new Image();
  cache.set(ref, image);

  image.onload = () => {
    for (const listener of listeners) listener();
  };

  image.onerror = () => {
    // Картинку могли удалить вместе с доской, пока вкладка была открыта.
    // Держать её в кэше незачем: следующая попытка сходит за ней заново.
    cache.delete(ref);
  };

  image.src = imageUrl(ref);
  return null;
}

/**
 * Ждёт, пока все нужные картинки окажутся в кэше.
 *
 * Нужно для сохранения доски картинкой: рисовать на холст то, что ещё не
 * загрузилось, — значит получить пустые места в готовом файле.
 */
export function preload(refs: string[]): Promise<void> {
  const pending = refs.filter((ref) => imageFor(ref) === null);
  if (pending.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      if (pending.every((ref) => imageFor(ref) !== null)) {
        stop();
        resolve();
      }
    };

    const stop = onImageLoaded(done);

    // Не ждём вечно: если картинка не пришла за пару секунд, сохраняем без неё.
    window.setTimeout(() => {
      stop();
      resolve();
    }, 3000);
  });
}
