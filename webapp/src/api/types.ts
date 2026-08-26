/** Учётная запись преподавателя. */
export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/** Ответ регистрации: учётной записью ещё нельзя пользоваться. */
export interface RegisterResponse {
  status: 'confirm_sent' | 'mail_failed';
  message: string;
}

export type BoardRole = 'owner' | 'editor' | 'viewer';

export interface Board {
  id: number;
  title: string;
  role: BoardRole;
  canEdit: boolean;
  canManage: boolean;
  locked: boolean;
  autoAdmit: boolean;
  /** Только у владельца: остальным раздавать доступ не положено. */
  linkUrl: string | null;
  updatedAt: string;
}

/** Участник с учётной записью. Гостей здесь нет — они нигде не хранятся. */
export interface BoardMember {
  userId: number;
  displayName: string;
  email: string;
  role: BoardRole;
  joinedAt: string;
}

/** Заявка в комнате ожидания. Видна только владельцу доски. */
export interface WaitingRequest {
  requestId: string;
  displayName: string;
  isGuest: boolean;
  requestedAt: string;
}

/**
 * Чем закончилась попытка войти по ссылке.
 *
 * Один ответ на все случаи: впустили, ждём решения, отказали, доска закрыта.
 * Разными полями это разошлось бы на четыре почти одинаковых обработчика.
 */
export interface JoinResult {
  status: 'admitted' | 'waiting' | 'rejected' | 'locked';
  boardId: number;
  boardTitle: string;
  role: BoardRole | null;
  guestToken: string | null;
  guestId: string | null;
  message: string | null;
}

/** Состояние доски для того, кто на ней. */
export interface BoardState {
  board: Board;
  me: {
    displayName: string;
    isGuest: boolean;
    role: BoardRole;
    guestId: string | null;
  };
  members: BoardMember[];
}
