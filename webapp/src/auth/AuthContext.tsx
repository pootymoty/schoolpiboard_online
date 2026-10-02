import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AUTH_EXPIRED_EVENT, api, readToken, tokenTimes, writeToken } from '../api/client';

/**
 * Не чаще этого просить продление входа: вход и так живёт 12 часов, а
 * просить на каждый щелчок — значит лишний запрос на каждое действие.
 */
const REFRESH_EVERY_MS = 15 * 60 * 1000;

/** Действия, которые значат «человек здесь и пользуется сайтом». */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;
import type { AuthResponse, User } from '../api/types';

interface AuthState {
  user: User | null;
  /** Пока true, ещё не известно, вошёл пользователь или нет. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Принять токен, выданный не формой входа: подтверждение почты, смена пароля. */
  accept: (result: AuthResponse) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // При сборке страниц в статический HTML браузера нет: узнавать, кто
  // вошёл, не у кого и незачем. Оставь здесь `true` — в готовый файл
  // попал бы экран загрузки, и поисковик увидел бы на всех адресах одно
  // слово «Загружаем».
  const [loading, setLoading] = useState(() => typeof window !== 'undefined');

  const refresh = useCallback(async () => {
    setUser(await api<User>('/auth/me'));
  }, []);

  // Токен из localStorage проверяем у сервера, а не верим ему на слово:
  // он мог протухнуть или быть выпущен прежним ключом подписи.
  useEffect(() => {
    if (!readToken()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    refresh()
      .catch(() => {
        if (!cancelled) writeToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const accept = useCallback((result: AuthResponse) => {
    writeToken(result.token);
    setUser(result.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      accept(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }));
    },
    [accept],
  );

  const logout = useCallback(() => {
    writeToken(null);
    setUser(null);
  }, []);

  // Вход истёк или отозван (сервер ответил 401 на запрос с токеном):
  // забываем токен — страница сама покажет, что нужно войти.
  useEffect(() => {
    const expired = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  }, [logout]);

  /**
   * Продление входа, пока человек пользуется сайтом.
   *
   * Вход живёт 12 часов. Любое действие — касание, щелчок, клавиша,
   * прокрутка — после 15 минут с выпуска токена тихо просит новый, и так
   * весь день, в том числе посреди урока на доске. Не трогали сайт 12
   * часов — продлевать было нечем, токен истёк, и при следующем действии
   * человек выходит (а открыв сайт заново — видит форму входа).
   */
  const refreshing = useRef(false);

  useEffect(() => {
    if (!user) return undefined;

    const onActivity = () => {
      const token = readToken();
      if (!token || refreshing.current) return;

      const times = tokenTimes(token);
      const now = Date.now();

      // Истёк, пока вкладка стояла без дела, — продлевать нечего.
      if (times && times.exp * 1000 <= now) {
        logout();
        return;
      }

      if (times && now - times.iat * 1000 < REFRESH_EVERY_MS) return;

      refreshing.current = true;
      api<{ token: string }>('/auth/refresh', { method: 'POST' })
        .then((answer) => writeToken(answer.token))
        // Не вышло (сеть) — попробуем на следующем действии; отозванный
        // вход закроет событие AUTH_EXPIRED_EVENT из api().
        .catch(() => undefined)
        .finally(() => { refreshing.current = false; });
    };

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true });
    // Сразу при открытии — тоже действие: человек только что пришёл.
    onActivity();

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
    };
  }, [user, logout]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, accept, refresh }),
    [user, loading, login, logout, accept, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth вызван вне AuthProvider');
  }
  return context;
}
