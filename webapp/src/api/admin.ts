import { api } from './client';

/**
 * Панель владельца сервиса.
 *
 * Подписки и деньги здесь только читаются: правка чужой подписки руками
 * означала бы, что она и платёжная система однажды расходятся. Модерация
 * досок — другое дело: закрыть жалобу или удалить доску с запрещённым
 * содержимым — не денежное действие, и панель делает это напрямую.
 */
export interface AdminUser {
  id: number;
  displayName: string;
  email: string;
  emailConfirmed: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  deletedAt: string | null;
  planName: string;
  until: string | null;
  autoRenew: boolean;
  boards: number;
  paid: number;
  spent: number;
}

export interface AdminPage {
  users: AdminUser[];
  total: number;
  page: number;
  size: number;
}

export interface AdminStats {
  users: number;
  confirmed: number;
  active: number;
  trials: number;
  boards: number;
  paidMonth: number;
  revenueMonth: number;
  revenueTotal: number;
  pending: number;
  abandoned: number;
}

export interface AdminOrder {
  invoiceId: string;
  planName: string;
  days: number;
  amount: number;
  status: string;
  autoRenew: boolean;
  createdAt: string;
  paidAt: string | null;
}

export function adminStats(): Promise<AdminStats> {
  return api<AdminStats>('/admin/stats');
}

export function adminUsers(
  query: string, page: number, size: number, signal?: AbortSignal,
): Promise<AdminPage> {
  const search = new URLSearchParams({ query, page: String(page), size: String(size) });
  return api<AdminPage>(`/admin/users?${search.toString()}`, { signal });
}

export function adminOrders(userId: number): Promise<AdminOrder[]> {
  return api<AdminOrder[]>(`/admin/users/${userId}/orders`);
}

/** Просит выслать код подтверждения на почту того, кто меняет роль. */
export function adminRoleRequest(userId: number, admin: boolean): Promise<{ sentTo: string }> {
  return api<{ sentTo: string }>(`/admin/users/${userId}/role/request`, {
    method: 'POST',
    body: { admin },
  });
}

export function adminRoleConfirm(
  userId: number, admin: boolean, code: string,
): Promise<{ isAdmin: boolean }> {
  return api<{ isAdmin: boolean }>(`/admin/users/${userId}/role/confirm`, {
    method: 'POST',
    body: { admin, code },
  });
}

export interface AdminReport {
  id: number;
  boardId: number;
  boardTitle: string;
  ownerEmail: string | null;
  ownerName: string | null;
  reporter: string;
  comment: string;
  createdAt: string;
}

export interface AdminBoard {
  id: number;
  title: string;
  ownerEmail: string | null;
  ownerName: string | null;
  items: number;
  createdAt: string;
}

export interface AdminBoardPage {
  boards: AdminBoard[];
  total: number;
  page: number;
  size: number;
}

export interface AdminBoardText {
  itemId: number;
  pageId: number;
  pageTitle: string;
  text: string;
  updatedAt: string;
}

export interface AdminFlagged {
  boardId: number;
  boardTitle: string;
  ownerEmail: string | null;
  itemId: number;
  text: string;
  reason: string;
}

export function adminReports(): Promise<AdminReport[]> {
  return api<AdminReport[]>('/admin/reports');
}

export function adminResolveReport(reportId: number): Promise<void> {
  return api<void>(`/admin/reports/${reportId}/resolve`, { method: 'POST' });
}

export function adminBoards(query: string, page: number, size: number): Promise<AdminBoardPage> {
  const search = new URLSearchParams({ query, page: String(page), size: String(size) });
  return api<AdminBoardPage>(`/admin/boards?${search.toString()}`);
}

export function adminBoardText(boardId: number): Promise<AdminBoardText[]> {
  return api<AdminBoardText[]>(`/admin/boards/${boardId}/text`);
}

export function adminFlaggedBoards(): Promise<AdminFlagged[]> {
  return api<AdminFlagged[]>('/admin/boards/flagged');
}

export function adminDeleteBoard(boardId: number): Promise<void> {
  return api<void>(`/admin/boards/${boardId}`, { method: 'DELETE' });
}
