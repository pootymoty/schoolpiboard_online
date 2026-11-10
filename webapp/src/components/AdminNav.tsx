import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

/** Подразделы администрирования — одни и те же в шапке, бургере и полосе вкладок. */
export const ADMIN_SECTIONS = [
  { path: '/admin/summary', title: 'Сводка' },
  { path: '/admin/boards', title: 'Доски' },
  { path: '/admin/users', title: 'Тарифы' },
  { path: '/admin/surveys', title: 'Опросы' },
] as const;

/**
 * Заголовок подраздела администрирования и вкладки между подразделами.
 *
 * Вкладки — ссылками: у каждого подраздела свой адрес, его можно открыть
 * сразу, сохранить в закладки и вернуться кнопкой «Назад».
 */
export function AdminHeader({ title, actions }: { title: string; actions?: ReactElement | null }): ReactElement {
  const tabs = useRef<HTMLElement | null>(null);

  // На телефоне вкладки не помещаются в ширину — открытая прокручивается в
  // видимую часть, иначе «Опросы» оставались за правым краем.
  useEffect(() => {
    const active = tabs.current?.querySelector<HTMLElement>('.active');
    const strip = tabs.current;
    if (!active || !strip) return;
    strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, [title]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="page-header__sub">Администрирование</p>
          <h1>{title}</h1>
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>

      <nav className="admin-tabs" aria-label="Подразделы администрирования" ref={tabs}>
        {ADMIN_SECTIONS.map((section) => (
          <NavLink key={section.path} to={section.path} className="admin-tabs__tab">
            {section.title}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
