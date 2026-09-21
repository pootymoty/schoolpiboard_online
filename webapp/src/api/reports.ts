import { api } from './client';
import { readGuestToken } from './guest';

/** Жалоба на доску — от кого угодно из тех, кто на неё попал, не только от владельца. */
export function reportBoard(boardId: number, comment: string): Promise<void> {
  return api<void>(`/boards/${boardId}/report`, {
    method: 'POST',
    body: { comment },
    guestToken: readGuestToken(boardId),
  });
}
