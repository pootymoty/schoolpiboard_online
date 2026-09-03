import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { COMPANY, HAS_COMPANY_DETAILS } from '../content/company';
import { IconMenu } from './Icons';
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
  // При сборке страниц в статический HTML документа нет вовсе, поэтому
  // читаем атрибут только когда есть что читать.
  const [theme, setTheme] = useState<Theme>(() => (
    typeof document === 'undefined'
      ? 'light'
      : (document.documentElement.getAttribute('data-theme') as Theme) || 'light'
  ));

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

/** Слайдер темы — вместо значка солнце/луна. */
function ThemeSwitch({ theme, toggle }: { theme: Theme; toggle: () => void }): ReactElement {
  return (
    <label className="theme-switch" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
      <input
        type="checkbox"
        checked={theme === 'dark'}
        onChange={toggle}
        aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      />
      <span className="theme-switch__track"><span className="theme-switch__thumb" /></span>
    </label>
  );
}

/** Запирает прокрутку страницы позади открытой на весь экран мобильной панели. */
function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    // Одного `overflow: hidden` для iOS Safari мало — страница всё равно
    // проскальзывает под панелью; помогает только `position: fixed`.
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [locked]);
}

export function Header(): ReactElement {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(false);

  useScrollLock(mobileOpen);

  // Переход по ссылке — сигнал, что мобильное меню своё дело сделало.
  useEffect(() => {
    setMobileOpen(false);
    setCabinetOpen(false);
  }, [location.pathname]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="header">
      <Link className="header__brand" to={user ? '/boards' : '/'}>SchoolPiBoard</Link>

      <span className="header__spacer" />

      <nav className="desktop-menu" aria-label="Разделы сайта">
        {user ? (
          <>
            <Link to="/">Главная</Link>
            <Link to="/features">Возможности</Link>
            <Link to="/pricing">Тарифы</Link>
            <Link to="/boards">Мои доски</Link>
            <Menu
              label="Личный кабинет"
              trigger="Личный кабинет"
              triggerClassName="btn-tool btn-tool--wide"
            >
              <Link className="btn btn-quiet menu__item" to="/plan">Мой тариф</Link>
              <Link className="btn btn-quiet menu__item" to="/profile">Настройки</Link>
              <button className="btn-quiet menu__item menu__item--danger" type="button" onClick={logout}>
                Выйти
              </button>
            </Menu>
          </>
        ) : (
          <>
            <Link to="/">Главная</Link>
            <Link to="/features">Возможности</Link>
            <Link to="/pricing">Тарифы</Link>
            <Link to="/faq">Вопросы</Link>
            <Link to="/login">Войти</Link>
          </>
        )}
      </nav>

      {/* На узком экране слайдер темы лежит в бургер-меню, а не рядом с
          ним отдельной кнопкой — тесно и незачем плодить точки на панели. */}
      <span className="theme-switch--header">
        <ThemeSwitch theme={theme} toggle={toggle} />
      </span>

      <button
        className="hamburger btn-tool"
        type="button"
        onClick={() => setMobileOpen((current) => !current)}
        aria-expanded={mobileOpen}
        aria-controls="navbar"
        aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
      >
        <IconMenu />
      </button>

      <div id="navbar" className={mobileOpen ? 'navbar navbar--show' : 'navbar'}>
        <ul>
          {user ? (
            <>
              <li><Link to="/" onClick={closeMobile}>Главная</Link></li>
              <li><Link to="/features" onClick={closeMobile}>Возможности</Link></li>
              <li><Link to="/pricing" onClick={closeMobile}>Тарифы</Link></li>
              <li><Link to="/faq" onClick={closeMobile}>Вопросы</Link></li>
              <li><Link to="/about" onClick={closeMobile}>О нас</Link></li>
              <li><Link to="/boards" onClick={closeMobile}>Мои доски</Link></li>
              <li className={cabinetOpen ? 'navbar-dropdown navbar-dropdown--active' : 'navbar-dropdown'}>
                <div
                  className="navbar-dropdown__toggle"
                  onClick={() => setCabinetOpen((current) => !current)}
                >
                  Личный кабинет
                </div>
                <ul className="navbar-submenu">
                  <li><Link to="/plan" onClick={closeMobile}>Мой тариф</Link></li>
                  <li><Link to="/profile" onClick={closeMobile}>Настройки</Link></li>
                  <li>
                    <button className="btn-quiet menu__item menu__item--danger" type="button" onClick={() => { closeMobile(); logout(); }}>
                      Выйти
                    </button>
                  </li>
                </ul>
              </li>
              <li className="navbar-item--switch">
                <span className="navbar-item__label">Тёмная тема</span>
                <ThemeSwitch theme={theme} toggle={toggle} />
              </li>
            </>
          ) : (
            <>
              <li><Link to="/" onClick={closeMobile}>Главная</Link></li>
              <li><Link to="/features" onClick={closeMobile}>Возможности</Link></li>
              <li><Link to="/pricing" onClick={closeMobile}>Тарифы</Link></li>
              <li><Link to="/faq" onClick={closeMobile}>Вопросы</Link></li>
              <li><Link to="/about" onClick={closeMobile}>О нас</Link></li>
              <li><Link to="/login" onClick={closeMobile}>Войти</Link></li>
              <li className="navbar-item--switch">
                <span className="navbar-item__label">Тёмная тема</span>
                <ThemeSwitch theme={theme} toggle={toggle} />
              </li>
            </>
          )}
        </ul>
      </div>
    </header>
  );
}

export function Footer(): ReactElement {
  return (
    <footer className="app__footer">
      <div className="row">
        <Link to="/legal/terms">Соглашение</Link>
        <Link to="/legal/privacy">Персональные данные</Link>
        <Link to="/legal/offer">Оферта</Link>
        <Link to="/about">Контакты</Link>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {HAS_COMPANY_DETAILS
          ? `SchoolPiBoard · ${COMPANY.name}, ${COMPANY.status}, ИНН ${COMPANY.inn} · ${COMPANY.email}`
          : 'SchoolPiBoard · board.school-pi.online · ЗАГЛУШКА: реквизиты продавца'}
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
 * Страница доски: без подвала, во весь экран и без прокрутки страницы —
 * холст сам управляет своим пространством.
 */
export function BoardShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="app app--board">
      <Header />
      <main className="app__main app__main--board">{children}</main>
    </div>
  );
}
