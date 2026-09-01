import { API_URL, ApiError, readToken } from './client';
import type { LibraryFile } from './types';

/**
 * Загрузка файлов идёт мимо `api()`: там тело всегда превращается в JSON,
 * а файл уезжает многочастной формой. Заголовок Content-Type для неё
 * ставит сам браузер — вместе с границей частей, которую руками не собрать.
 */
async function send<T>(path: string, form: FormData, guestToken?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  const token = readToken();

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (guestToken) headers['X-Guest-Token'] = guestToken;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  } catch {
    throw new ApiError(0, 'network', 'Сервер не отвечает. Проверьте подключение.');
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const details = (payload ?? {}) as { message?: string };
    throw new ApiError(response.status, 'error', details.message ?? 'Не удалось загрузить файл.');
  }

  return payload as T;
}

/** Кладёт файл в личную библиотеку. */
export function uploadToLibrary(file: File): Promise<LibraryFile> {
  const form = new FormData();
  form.append('file', file, file.name);
  return send<LibraryFile>('/files', form);
}

export interface BoardImage {
  imageRef: string;
  url: string;
}

/** Кладёт картинку на доску. Возвращает ключ, по которому её потом видно всем. */
export function uploadBoardImage(
  boardId: number, blob: Blob, name: string, guestToken?: string | null,
): Promise<BoardImage> {
  const form = new FormData();
  form.append('file', blob, name);
  return send<BoardImage>(`/boards/${boardId}/images`, form, guestToken);
}

/** Оригинал файла из библиотеки — байтами, чтобы отрисовать страницу в браузере. */
export async function readLibraryFile(fileId: number): Promise<ArrayBuffer> {
  const headers: Record<string, string> = {};
  const token = readToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/files/${fileId}/raw`, { headers });
  if (!response.ok) throw new ApiError(response.status, 'error', 'Не удалось прочитать файл.');

  return response.arrayBuffer();
}

/** Адрес картинки на доске. Ключ неугадываемый — он и есть пропуск к ней. */
export function imageUrl(imageRef: string): string {
  return `${API_URL}/images/${imageRef}`;
}

/** Размер файла человеческими словами. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
