export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000';

const TOKEN_KEY = 'schoolpiboard.token';

/** Событие окна: вход истёк или отозван — пора забыть токен. */
export const AUTH_EXPIRED_EVENT = 'auth-expired';

/**
 * Поля токена, нужные браузеру: когда выпущен и до когда действует
 * (секунды Unix). Подпись тут не проверяется — это делает сервер; браузеру
 * только решить, пора ли продлить и не истёк ли он уже.
 */
export function tokenTimes(token: string): { iat: number; exp: number } | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { iat?: number; exp?: number };
    return typeof payload.exp === 'number' ? { iat: payload.iat ?? 0, exp: payload.exp } : null;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function writeToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Ошибка от сервера в том виде, в каком её можно показать человеку.
 * Сервер всегда присылает message на русском — придумывать свой текст
 * поверх него не нужно.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Токен гостя. Уезжает отдельным заголовком, а не в Authorization:
   * там лежит токен учётной записи, и смешивать их значило бы разбирать
   * на сервере, чей именно токен пришёл.
   */
  guestToken?: string | null;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = readToken();

  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.guestToken) {
    headers['X-Guest-Token'] = options.guestToken;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    // Сеть не ответила вовсе — отличаем это от ошибки сервера.
    throw new ApiError(0, 'network', 'Сервер не отвечает. Проверьте подключение.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : null;

  // Вход больше не действует (истёк за 12 часов простоя, отозван,
  // старше 30 дней) — сервер отвечает 401 с заголовком WWW-Authenticate.
  // Сообщаем приложению: оно забудет токен и покажет, что нужно войти.
  // По заголовку, а не по одному статусу: 401 бывает и у «неверный
  // пароль» при удалении аккаунта — это не повод выходить.
  if (response.status === 401 && token && response.headers.get('WWW-Authenticate')?.startsWith('Bearer')) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!response.ok) {
    const details = (payload ?? {}) as { error?: string; message?: string };
    throw new ApiError(
      response.status,
      details.error ?? 'error',
      details.message ?? defaultMessage(response.status),
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Нужно войти заново.';
  if (status === 403) return 'Недостаточно прав.';
  if (status === 404) return 'Не найдено.';
  if (status === 429) return 'Слишком много попыток. Подождите минуту.';
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
