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

/** Справка. */
export const IconHelp = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.2-1.2.9-1.2 1.6v.5" />
      <path d="M12 17h.01" />
    </g>
  </Svg>
);

/** Таймер занятия. */
export const IconTimer = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
    </g>
  </Svg>
);

/** Сохранить картинкой. */
export const IconDownload = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 21h16" /></g></Svg>
);

/** Фон и разлиновка. */
export const IconGrid = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </g>
  </Svg>
);

/** Дублировать. */
export const IconCopy = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a1 1 0 0 1 1-1h9" />
    </g>
  </Svg>
);

/** На передний план. */
export const IconToFront = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="8" y="3" width="13" height="13" rx="2" />
      <path d="M16 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3" />
    </g>
  </Svg>
);

/** На задний план. */
export const IconToBack = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="3" y="8" width="13" height="13" rx="2" />
      <path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" />
    </g>
  </Svg>
);

/** Маркер: плоское перо, полупрозрачный след. */
export const IconMarker = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <path d="M4 20h6l9.5-9.5a2.5 2.5 0 0 0-3.5-3.5L6 16.5z" />
      <path d="M3 20h4" />
    </g>
  </Svg>
);

/** Фигуры. */
export const IconShapes = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="3" y="10" width="11" height="11" rx="1" />
      <circle cx="16" cy="7" r="4" />
    </g>
  </Svg>
);

/** Текст. */
export const IconText = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M5 6V4h14v2" /><path d="M12 4v16" /><path d="M9 20h6" /></g></Svg>
);

/** Курсор: выделять и перемещать. */
export const IconCursor = (props: Props): ReactElement => (
  <Svg {...props}><path d="M5 3l14 8-6 1.5L10 19z" /></Svg>
);

/** Отменить. */
export const IconUndo = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M3 8h11a6 6 0 0 1 0 12H8" /><path d="M7 4L3 8l4 4" /></g></Svg>
);

/** Повторить. */
export const IconRedo = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M21 8H10a6 6 0 0 0 0 12h6" /><path d="M17 4l4 4-4 4" /></g></Svg>
);

/** Рука: двигать холст. */
export const IconHand = (props: Props): ReactElement => (
  <Svg {...props}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v1m0 0a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3L5 15.5a1.5 1.5 0 0 1 2.6-1.5l.9 1.5" />
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

/** Картинка или страница документа: вставить файл на доску. */
export const IconImage = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5-6 6-3-3-4 4" />
    </g>
  </Svg>
);

/** Бургер: открыть мобильное меню. */
export const IconMenu = (props: Props): ReactElement => (
  <Svg {...props}><g><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></g></Svg>
);

/** Стрелка раскрывающегося пункта меню. */
export const IconChevronDown = (props: Props): ReactElement => (
  <Svg {...props}><path d="M6 9l6 6 6-6" /></Svg>
);

/** Таблица: сетка три на три — по ней узнают инструмент. */
export const IconTable = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </g>
  </Svg>
);

/** Вставка из буфера: планшет с листом. */
export const IconPaste = (props: Props): ReactElement => (
  <Svg {...props}>
    <g>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </g>
  </Svg>
);
