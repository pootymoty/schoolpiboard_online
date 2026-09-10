import { api } from './client';

/**
 * Панель владельца сервиса.
 *
 * Только чтение: посмотреть, кто пришёл и что купил. Менять чужую
 * подписку отсюда нельзя — деньги и доступ живут в платёжной системе, и
 * правка руками означала бы, что они однажды разойдутся.
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
