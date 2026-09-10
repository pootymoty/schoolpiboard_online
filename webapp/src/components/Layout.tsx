import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { COMPANY, HAS_COMPANY_DETAILS } from '../content/company';


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

/**
 * Слайдер темы.
 *
 * С подписью, а не голым ползунком: переключатель без слова читается как
 * настройка чего угодно — от звука до уведомлений, — и понять, что это
 * тема, можно было только нажав.
 */
function ThemeSwitch({
  theme, toggle, label = 'Тёмная тема',
}: { theme: Theme; toggle: () => void; label?: string }): ReactElement {
  return (
    <label className="theme-switch">
      <span className="theme-switch__label">{label}</span>
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

/**
 * Запирает прокрутку страницы позади открытой на весь экран панели.
 *
 * Одного `overflow: hidden` для iOS Safari мало — страница всё равно
 * проскальзывает под панелью; помогает только `position: fixed`. Но он
 * же сбрасывает страницу в начало, поэтому положение запоминается до
 * блокировки и возвращается после — мгновенно, иначе видно, как страница
 * едет снизу вверх на глазах.
 */
function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return undefined;

    const saved = window.scrollY || 0;

    document.body.style.top = `-${saved}px`;
    document.body.classList.add('no-scroll');

    return () => {
      const root = document.documentElement;
      const smooth = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';

      document.body.classList.remove('no-scroll');
      document.body.style.top = '';
      window.scrollTo(0, saved);

      root.style.scrollBehavior = smooth;
    };
  }, [locked]);
}

export function Header(): ReactElement {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(false);

  /** Открыто ли выпадающее меню кабинета на широком экране. */
  const [dropOpen, setDropOpen] = useState(false);

  const drop = useRef<HTMLLIElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const burger = useRef<HTMLButtonElement | null>(null);

  useScrollLock(mobileOpen);

  // Переход по ссылке — сигнал, что меню своё дело сделало.
  useEffect(() => {
    setMobileOpen(false);
    setCabinetOpen(false);
    setDropOpen(false);
  }, [location.pathname]);

  const closeMobile = () => setMobileOpen(false);

  // Щелчок мимо закрывает и выпадающее меню, и панель: открытое меню,
  // которое закрывается только повторным щелчком по кнопке, приходится
  // закрывать осознанно — а его просто перестают замечать.
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (drop.current && !drop.current.contains(target)) setDropOpen(false);

      if (panel.current && burger.current
          && !panel.current.contains(target) && !burger.current.contains(target)) {
        setMobileOpen(false);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDropOpen(false);
      setMobileOpen(false);
    };

    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);

    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  // Смахивание вправо закрывает панель — в ту же сторону, куда она
  // уезжает; оттуда же она и выехала.
  useEffect(() => {
    if (!mobileOpen) return undefined;

    let from = 0;

    const start = (event: TouchEvent) => { from = event.changedTouches[0].screenX; };
    const end = (event: TouchEvent) => {
      if (event.changedTouches[0].screenX > from + 50) setMobileOpen(false);
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });

    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchend', end);
    };
  }, [mobileOpen]);

  return (
    <header className="header">
      <Link className="header__brand" to={user ? '/boards' : '/'}>SchoolPiBoard</Link>

      <span className="header__spacer" />

      {/* Одни и те же разделы у гостя и у вошедшего, в одном и том же
          месте: меню, которое перестраивается после входа, заставляет
          искать заново то, что человек уже нашёл. «Главной» в списке нет —
          на неё ведёт название слева, как на любом сайте. */}
      <nav aria-label="Разделы сайта">
        <ul className="desktop-menu">
          <li><NavLink to="/features">Возможности</NavLink></li>
          <li><NavLink to="/pricing">Тарифы</NavLink></li>
          <li><NavLink to="/faq">Вопросы</NavLink></li>

          {user ? (
            <>
              <li><NavLink to="/boards">Мои доски</NavLink></li>

              {/* Подменю невидимо и приподнято, пока закрыто: появление
                  плавное, а не рывком. Стрелка крутится по тому же
                  признаку, что и открытость, — рассинхрона быть не может. */}
              <li className="dropdown" ref={drop}>
                <button
                  className={dropOpen ? 'dropdown-toggle active' : 'dropdown-toggle'}
                  type="button"
                  aria-expanded={dropOpen}
                  onClick={() => setDropOpen((current) => !current)}
                >
                  Личный кабинет
                  <span className="dropdown-arrow" aria-hidden="true" />
                </button>

                <ul className={dropOpen ? 'dropdown-menu show' : 'dropdown-menu'}>
                  {user.isAdmin ? (
                    <li><Link to="/admin">Администрирование</Link></li>
                  ) : null}
                  <li><Link to="/plan">Мой тариф</Link></li>
                  <li><Link to="/profile">Настройки</Link></li>
                  <li>
                    <button className="dropdown-menu__danger" type="button" onClick={logout}>
                      Выйти
                    </button>
                  </li>
                </ul>
              </li>
            </>
          ) : (
            <li>
              <Link className="btn btn-primary btn-sm header__cta" to="/login">Войти</Link>
            </li>
          )}
        </ul>
      </nav>

      {/* На узком экране слайдер темы лежит в бургер-меню, а не рядом с
          ним отдельной кнопкой — тесно и незачем плодить точки на панели. */}
      <span className="theme-switch--header">
        <ThemeSwitch theme={theme} toggle={toggle} />
      </span>

      {/* Крестик собирается из тех же трёх полосок: средняя гаснет,
          крайние съезжаются к середине и разворачиваются навстречу.
          Подменить значок на «✕» значило бы не показать превращение. */}
      <button
        ref={burger}
        className={mobileOpen ? 'hamburger is-open' : 'hamburger'}
        type="button"
        onClick={() => setMobileOpen((current) => !current)}
        aria-expanded={mobileOpen}
        aria-controls="navbar"
        aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
      >
        <span className="hamburger-box" aria-hidden="true">
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </span>
      </button>

      <div
        id="navbar"
        ref={panel}
        className={mobileOpen ? 'navbar navbar--show' : 'navbar'}
      >
        <ul>
          {user ? (
            <>
              <li><Link to="/features" onClick={closeMobile}>Возможности</Link></li>
              <li><Link to="/pricing" onClick={closeMobile}>Тарифы</Link></li>
              <li><Link to="/faq" onClick={closeMobile}>Вопросы</Link></li>
              <li><Link to="/about" onClick={closeMobile}>О нас</Link></li>
              <li><Link to="/boards" onClick={closeMobile}>Мои доски</Link></li>
              <li className={cabinetOpen ? 'navbar-dropdown navbar-dropdown--active' : 'navbar-dropdown'}>
                <button
                  className="navbar-dropdown__toggle"
                  type="button"
                  aria-expanded={cabinetOpen}
                  onClick={() => setCabinetOpen((current) => !current)}
                >
                  Личный кабинет
                  <span className="navbar-dropdown__arrow" aria-hidden="true" />
                </button>
                <ul className="navbar-submenu">
                  {user.isAdmin ? (
                    <li><Link to="/admin" onClick={closeMobile}>Администрирование</Link></li>
                  ) : null}
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
                <ThemeSwitch theme={theme} toggle={toggle} />
              </li>
            </>
          ) : (
            <>
              <li><Link to="/features" onClick={closeMobile}>Возможности</Link></li>
              <li><Link to="/pricing" onClick={closeMobile}>Тарифы</Link></li>
              <li><Link to="/faq" onClick={closeMobile}>Вопросы</Link></li>
              <li><Link to="/about" onClick={closeMobile}>О нас</Link></li>
              <li><Link to="/login" onClick={closeMobile}>Войти</Link></li>
              <li className="navbar-item--switch">
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
        <Link to="/legal/offer">Оферта</Link>
        <Link to="/legal/privacy">Персональные данные</Link>
        <Link to="/about">Контакты</Link>
      </div>

      {/* В подвале — кто продавец и куда писать. Статус, ИНН и прочие
          реквизиты живут в документах, куда ведут ссылки выше: в подвале
          они превращают строку в выписку из реестра. */}
      <p className="small" style={{ margin: 0 }}>
        {HAS_COMPANY_DETAILS
          ? `SchoolPiBoard · ${COMPANY.name} · ${COMPANY.email}`
          : 'SchoolPiBoard · board.school-pi.online'}
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
