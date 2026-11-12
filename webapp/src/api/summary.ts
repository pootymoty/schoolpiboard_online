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
  /** Страницы, открытые попросившему: в письмо идут только они. */
  pageIds: number[];
}

/** Участники с одинаковым доступом к страницам — им уходит одно письмо. */
export interface SummaryGroup {
  pageIds: number[];
  count: number;
}

/** Один лист конспекта — картинка страницы и номер этой страницы. */
export interface SummarySheet {
  pageId: number;
  name: string;
  blob: Blob;
}

export function getSummaryGroups(boardId: number, audience: SummaryAudienceKind): Promise<SummaryGroup[]> {
  return api<SummaryGroup[]>(`/boards/${boardId}/summary/groups?audience=${audience}`);
}

/** Сколько участников с подтверждённой почтой получат рассылку. */
export interface SummaryAudience {
  /** Сейчас на доске. */
  online: number;
  /** Все участники доски, кроме владельца. */
  all: number;
  /** Гостей на доске сейчас — у них почты нет, рассылка до них не дойдёт. */
  guestsOnline: number;
}

/** Кому разослать: тем, кто сейчас на доске, или всем участникам. */
export type SummaryAudienceKind = 'online' | 'all';

export function getSummaryAudience(boardId: number): Promise<SummaryAudience> {
  return api<SummaryAudience>(`/boards/${boardId}/summary/audience`);
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
 *
 * `pageCount` — сколько страниц доски в конспекте, для письма. Когда
 * `pages` — один PDF-файл, а не картинка на страницу, это число иначе не
 * получить: вложение всего одно, а страниц внутри может быть до двенадцати.
 */
export async function sendSummary(
  boardId: number, requestId: number | null, pages: { name: string; blob: Blob }[],
  pageCount = pages.length,
  audience: SummaryAudienceKind | null = null,
  sheetPages: number[] = [],
  group: number[] = [],
): Promise<void> {
  const form = new FormData();
  if (requestId !== null) form.append('requestId', String(requestId));
  if (audience) form.append('audience', audience);
  form.append('sheetPages', sheetPages.join(','));
  form.append('group', group.join(','));
  form.append('pageCount', String(pageCount));
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
