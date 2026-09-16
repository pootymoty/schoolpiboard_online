import { api } from './client';
import { readGuestToken } from './guest';
import type { ItemData } from '../board/protocol';

/**
 * Закладка для панели-списка.
 *
 * `data` приходит тем же самым объектом, каким закладку видит холст —
 * `x1`/`y1` (точка) и `text` (подпись). Отдельно их не распаковываем:
 * панель просто читает эти же поля, что и рендер на доске.
 */
export interface Bookmark {
  id: number;
  pageId: number;
  pageTitle: string;
  data: ItemData;
}

/** Закладки всей доски, а не одной открытой страницы — панель даёт перейти к любой. */
export function listBookmarks(boardId: number): Promise<Bookmark[]> {
  return api<Bookmark[]>(`/boards/${boardId}/bookmarks`, { guestToken: readGuestToken(boardId) });
}
