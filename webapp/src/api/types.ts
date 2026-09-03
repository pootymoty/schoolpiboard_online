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

/** Участник с учётной записью. Роль и доступ сохранены за ним навсегда. */
export interface BoardMember {
  userId: number;
  displayName: string;
  email: string;
  role: BoardRole;
  joinedAt: string;
}

/**
 * Гость, впущенный на доску прямо сейчас. Не хранится — присылается
 * заново с каждым опросом состояния, пока человек на доске.
 */
export interface ActiveGuest {
  guestId: string;
  displayName: string;
  role: BoardRole;
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
  guests: ActiveGuest[];
}

/** Файл в библиотеке: PDF или картинка, загруженные один раз и надолго. */
export interface LibraryFile {
  id: number;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** Библиотека целиком: файлы, место и доступна ли она на текущем тарифе. */
export interface Library {
  files: LibraryFile[];
  used: number;
  quota: number;
  maxFileSize: number;
  allowed: boolean;
}

/** Тариф: пределы и цены за периоды. */
export interface Plan {
  code: string;
  name: string;

  /** Уровень тарифа: чем больше, тем выше. По нему решается, что повышение. */
  sort: number;
  price30: number;
  price90: number;
  price180: number;
  price365: number;
  maxBoards: number;
  maxStorageBytes: number;
  maxParticipants: number;
  hasLibrary: boolean;
}

/** Что у меня сейчас: тариф, срок и насколько израсходованы пределы. */
/** Оплаченный срок, который ещё не начался. */
export interface Upcoming {
  planCode: string;
  planName: string;
  startsAt: string;
  endsAt: string;
}

export interface MyPlan {
  plan: Plan;
  kind: 'free' | 'trial' | 'paid';
  until: string | null;
  autoRenew: boolean;

  /**
   * Можно ли вообще включить автопродление. Робокасса разрешает повторные
   * списания только по счёту, помеченному таким при оплате, — задним
   * числом это не включается.
   */
  canAutoRenew: boolean;

  boards: number;
  storageUsed: number;

  /** Что начнётся после текущего срока. */
  upcoming: Upcoming[];

  /** Можно ли перейти на отложенный тариф досрочно (только вверх по уровню). */
  canStartUpcomingNow: boolean;
}

/** Строка истории покупок. */
export interface Order {
  invoiceId: string;
  planName: string;
  days: number;
  amount: number;
  autoRenew: boolean;

  /**
   * `abandoned` — заказ, по которому не пришло подтверждения. Отказов
   * платёжная система не присылает вовсе: она сообщает только об успехе.
   */
  status: 'pending' | 'paid' | 'abandoned';
  createdAt: string;
  paidAt: string | null;
}
