import { api, API_URL, ApiError, readToken } from './client';

/**
 * Конспект занятия по почте.
 *
 * Просит участник, отправляет владелец: адрес называет тот, кому конспект
 * нужен, а решение отправлять принимает тот, кто вёл занятие. Иначе доска
 * стала бы способом слать письма с вложениями на любой адрес от нашего
 * имени.
 */
export interface SummaryRequest {
  id: number;
  email: string;
  askedName: string;
  createdAt: string;
}

export function askSummary(boardId: number, email: string, guestToken?: string | null): Promise<void> {
  return api<void>(`/boards/${boardId}/summary/request`, {
    method: 'POST',
    body: { email },
    guestToken,
  });
}

export function listSummaryRequests(boardId: number): Promise<SummaryRequest[]> {
  return api<SummaryRequest[]>(`/boards/${boardId}/summary/requests`);
}

export function declineSummaryRequest(boardId: number, requestId: number): Promise<void> {
  return api<void>(`/boards/${boardId}/summary/requests/${requestId}/decline`, { method: 'POST' });
}

/**
 * Отправляет конспект. Листы уезжают многочастной формой, как всякая
 * загрузка файлов: `api()` кладёт тело в JSON, а картинки так не отправить.
 */
export async function sendSummary(
  boardId: number, requestId: number | null, pages: { name: string; blob: Blob }[],
): Promise<void> {
  const form = new FormData();
  if (requestId !== null) form.append('requestId', String(requestId));
  for (const page of pages) form.append('pages', page.blob, page.name);

  const headers: Record<string, string> = {};
  const token = readToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/boards/${boardId}/summary`, {
      method: 'POST', headers, body: form,
    });
  } catch {
    throw new ApiError(0, 'network', 'Сервер не отвечает. Проверьте подключение.');
  }

  if (response.ok) return;

  const text = await response.text();
  const details = (text ? JSON.parse(text) : {}) as { message?: string };
  throw new ApiError(response.status, 'error', details.message ?? 'Конспект не отправился.');
}
