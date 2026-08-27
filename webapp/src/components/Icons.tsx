import type { ReactElement } from 'react';

/**
 * Значки. Векторные и красятся через currentColor — растровые из темы
 * не подошли бы: на доске значок должен менять цвет вместе с состоянием
 * кнопки и работать в обеих темах без второго набора файлов.
 *
 * Размер по умолчанию совпадает с высотой строки, чтобы значок в списке
 * участников стоял вровень с именем.
 */

interface Props {
  size?: number;
  title?: string;
}

function Svg({ size = 18, title, children }: Props & { children: ReactElement }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Владелец доски. Корона. */
export const IconOwner = (props: Props): ReactElement => (
  <Svg {...props}><path d="M3 7l4 4 5-7 5 7 4-4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);

/** Редактор: может рисовать. Карандаш. */
export const IconEditor = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></g></Svg>
);

/** Наблюдатель: только смотрит. Глаз. */
export const IconViewer = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></g></Svg>
);

/** Гость без учётной записи. Шляпа и очки. */
export const IconGuest = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <path d="M3 10h18" />
      <path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
      <circle cx="7.5" cy="15.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
      <path d="M10 15.5h4" />
    </g>
  </Svg>
);

/** Замок закрыт: новых не впускать. */
export const IconLockClosed = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </g>
  </Svg>
);

/** Замок открыт: вход по ссылке работает. */
export const IconLockOpen = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </g>
  </Svg>
);

/** Поделиться ссылкой. */
export const IconLink = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </g>
  </Svg>
);

/** Участники доски. */
export const IconPeople = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </g>
  </Svg>
);

/** Ластик. */
export const IconEraser = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <path d="M4 16.5 12.5 8a2.1 2.1 0 0 1 3 0l4 4a2.1 2.1 0 0 1 0 3L15 20H8z" />
      <path d="M9 13.5 15.5 20" />
      <path d="M4 20h16" />
    </g>
  </Svg>
);

/** Очистить доску. */
export const IconTrash = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </g>
  </Svg>
);

/** Учётная запись — свёрнутое меню профиля в шапке. */
export const IconUser = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </g>
  </Svg>
);

/** Три точки: меню действий. */
export const IconMore = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </g>
  </Svg>
);

/** Листалка списка участников: назад. */
export const IconChevronLeft = (props: Props): ReactElement => (
  <Svg {...props}><path d="M15 18l-6-6 6-6" /></Svg>
);

/** Листалка списка участников: вперёд. */
export const IconChevronRight = (props: Props): ReactElement => (
  <Svg {...props}><path d="M9 18l6-6-6-6" /></Svg>
);

export const IconCheck = (props: Props): ReactElement => (
  <Svg {...props}><path d="M20 6L9 17l-5-5" /></Svg>
);

export const IconClose = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M18 6L6 18" /><path d="M6 6l12 12" /></g></Svg>
);

/** Светлая тема — солнце. */
export const IconSun = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </g>
  </Svg>
);

/** Тёмная тема — луна. */
export const IconMoon = (props: Props): ReactElement => (
  <Svg {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>
);
