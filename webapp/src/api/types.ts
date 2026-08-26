/** Учётная запись преподавателя. */
export interface User {
  id: number;
  email: string;
  displayName: string;
}

/** Ответ на вход, подтверждение почты и смену пароля. */
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
  updatedAt: string;
}

/** Ссылка на доску. Показывается владельцу целиком и сколько угодно раз. */
export interface BoardLink {
  id: number;
  url: string;
  role: 'editor' | 'viewer';
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface BoardMember {
  userId: number;
  displayName: string;
  email: string;
  role: BoardRole;
  source: 'owner' | 'link';
  banned: boolean;
  joinedAt: string;
}

/** Что за доска — видно до входа, чтобы человек понимал, куда его зовут. */
export interface JoinInfo {
  boardTitle: string;
  role: 'editor' | 'viewer';
}

/** Гостевой вход: токен привязан к одной доске и больше ничего не даёт. */
export interface GuestSession {
  guestToken: string;
  /**
   * Метка браузера. Сохраняется и присылается при следующем заходе: по ней
   * владелец выгоняет гостя на пятнадцать минут. Без неё выгнанный обходил
   * бы отказ простым обновлением страницы, получая каждый раз новую метку.
   */
  guestId: string;
  boardId: number;
  boardTitle: string;
  role: 'editor' | 'viewer';
}

/** Состояние доски для того, кто на ней. */
export interface BoardState {
  board: Board;
  me: {
    displayName: string;
    isGuest: boolean;
    role: BoardRole;
  };
}
