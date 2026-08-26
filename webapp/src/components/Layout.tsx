import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { IconMoon, IconSun, IconUser } from './Icons';
import { Menu } from './Menu';

type Theme = 'light' | 'dark';

/**
 * Переключатель темы.
 *
 * Начальное значение читается из атрибута, который проставил скрипт в
 * index.html: если бы тему ставило приложение, между показом страницы и
 * запуском кода мелькал бы светлый фон.
 */
function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.getAttribute('data-theme') as Theme) || 'light',
  );

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // В приватном режиме хранилище недоступно — тема продержится до
      // перезагрузки страницы, и это лучше, чем падение.
    }
    setTheme(next);
  };

  return { theme, toggle };
}

export function Header(): ReactElement {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <header className="header">
      <Link className="header__brand" to={user ? '/boards' : '/'}>SchoolPiBoard</Link>

      <span className="header__spacer" />

      <button
        className="btn-tool"
        type="button"
        onClick={toggle}
        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>

      {user ? (
        <>
          <Link to="/boards">Мои доски</Link>
          <Menu
            label={`Аккаунт: ${user.displayName}`}
            trigger={<><IconUser size={18} /> {user.displayName}</>}
            triggerClassName="btn-tool btn-tool--wide"
          >
            <Link className="btn btn-quiet menu__item" to="/profile">Профиль</Link>
            <button className="btn-quiet menu__item menu__item--danger" type="button" onClick={logout}>
              Выйти
            </button>
          </Menu>
        </>
      ) : (
        <>
          <Link to="/login">Войти</Link>
          <Link className="btn btn-primary btn-sm" to="/register">Регистрация</Link>
        </>
      )}
    </header>
  );
}

export function Footer(): ReactElement {
  return (
    <footer className="app__footer">
      <div className="row">
        <Link to="/legal/terms">Условия использования</Link>
        <Link to="/legal/privacy">Персональные данные</Link>
        <Link to="/legal/offer">Оферта</Link>
      </div>
      <p className="small" style={{ margin: 0 }}>
        SchoolPiBoard · board.school-pi.online · ЗАГЛУШКА: реквизиты продавца
      </p>
    </footer>
  );
}

/** Обычная страница: шапка, содержимое, подвал. */
export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }): ReactElement {
  return (
    <div className="app">
      <Header />
      <main className={narrow ? 'app__main app__main--narrow' : 'app__main'}>{children}</main>
      <Footer />
    </div>
  );
}

/**
 * Страница доски: без подвала и с содержимым во всю высоту.
 * На доске рисуют — правовые ссылки под холстом только отнимали бы место.
 */
export function BoardShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="app">
      <Header />
      <main className="app__main">{children}</main>
    </div>
  );
}
