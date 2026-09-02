import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, readToken, writeToken } from '../api/client';
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
