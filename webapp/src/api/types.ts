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

/** Ответ регистрации: учётной записи ещё нельзя пользоваться. */
export interface RegisterResponse {
  status: 'confirm_sent' | 'mail_failed';
  message: string;
}
