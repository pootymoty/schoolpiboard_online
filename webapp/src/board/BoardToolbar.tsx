import type { ReactElement } from 'react';
import {
  IconCursor, IconEditor, IconEraser, IconHand, IconMarker,
  IconDownload, IconGrid, IconHelp, IconImage, IconTimer, IconRedo, IconShapes, IconTable, IconText,
  IconTrash, IconUndo, IconPaste, IconPages, IconLibrary, IconMail, IconBookmark, IconTarget,
  IconRecord, IconPlay, IconPause, IconStop, IconChevronLeft, IconChevronDown,
} from '../components/Icons';
import type { Tool, ToolSettings } from './tools';
import { toolColor } from './tools';

interface ToolProps {
  tool: Tool;
  settings: ToolSettings;
  /** Наблюдателю доступна только навигация — остальное заблокировано. */
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Гостю загрузка закрыта: файлы кладут только те, у кого есть учётная запись. */
  canUpload: boolean;
  onFiles: () => void;
  onLibrary: () => void;
  /** Убрать с экрана на телефоне — на счету каждый пиксель холста. */
  open: boolean;
  onToggleOpen: () => void;
}

/**
 * Инструменты рисования — вертикальной полосой слева от холста.
 *
 * Повторный щелчок по уже выбранному рисующему инструменту открывает его
 * параметры: так настройка не занимает отдельной кнопки, а до неё всё
 * равно один щелчок.
 */
export function DrawToolbar({
  tool, settings, canEdit, canUndo, canRedo, onTool, onUndo, onRedo, canUpload, onFiles, onLibrary,
  open, onToggleOpen,
}: ToolProps): ReactElement {
  const pick = (which: Tool, icon: ReactElement, title: string, needsEdit = true) => {
    const dot = toolColor(which, settings);

    const label = needsEdit && !canEdit ? 'Доступно редактору' : title;

    return (
      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === which}
        onClick={() => onTool(which)}
        disabled={needsEdit && !canEdit}
        title={label}
        // Своя подсказка вместо системной: та появляется через секунду
        // с лишним, а к тому времени в незнакомый значок уже ткнули.
        data-tip={label}
      >
        {icon}
        {dot ? <span className="tool-dot" style={{ background: dot }} aria-hidden="true" /> : null}
      </button>
    );
  };

  return (
    <>
    <div
      className={open ? 'toolbar toolbar--vertical' : 'toolbar toolbar--vertical toolbar--collapsed'}
      role="toolbar" aria-label="Инструменты рисования"
    >
      <button
        className="btn-tool" type="button" onClick={onUndo}
        disabled={!canEdit || !canUndo} title="Отменить (Ctrl+Z)" aria-label="Отменить"
        data-tip="Отменить (Ctrl+Z)"
      >
        <IconUndo />
      </button>

      <button
        className="btn-tool" type="button" onClick={onRedo}
        disabled={!canEdit || !canRedo} title="Повторить (Ctrl+Y)" aria-label="Повторить"
        data-tip="Повторить (Ctrl+Y)"
      >
        <IconRedo />
      </button>

      <span className="toolbar__divider" aria-hidden="true" />

      {pick('select', <IconCursor />, 'Выделять и перемещать')}
      {pick('hand', <IconHand />, 'Двигать холст. То же — пробел или средняя кнопка', false)}
      {pick('pen1', <IconEditor />, 'Перо 1')}
      {pick('pen2', <IconEditor />, 'Перо 2')}
      {pick('marker', <IconMarker />, 'Маркер')}
      {pick('eraser', <IconEraser />, 'Ластик')}
      {pick('text', <IconText />, 'Текст')}
      {pick('shapes', <IconShapes />, 'Фигуры')}
      {pick('table', <IconTable />, 'Таблица')}

      {/* Заготовки и файлы — тоже про то, что кладут на холст, а не про
          вид на него, поэтому здесь, рядом с рисующими инструментами, а
          не в верхней панели. */}
      {canEdit ? (
        <>
          <span className="toolbar__divider" aria-hidden="true" />

          <button
            className="btn-tool" type="button" onClick={onLibrary}
            title="Шаблоны: чертежи, знаки, формулы" data-tip="Шаблоны: чертежи, знаки, формулы"
          >
            <IconLibrary />
          </button>

          {canUpload ? (
            <button
              className="btn-tool" type="button" onClick={onFiles}
              title="Вставить файл или страницу PDF" data-tip="Вставить файл или страницу PDF"
            >
              <IconImage />
            </button>
          ) : null}
        </>
      ) : null}
    </div>

    {/* Только на телефоне: на большом экране панель инструментов не
        загораживает ничего и убирать её незачем. */}
    <button
      type="button"
      className={open ? 'toolbar-toggle toolbar-toggle--vertical' : 'toolbar-toggle toolbar-toggle--vertical toolbar-toggle--closed'}
      onClick={onToggleOpen}
      aria-expanded={open}
      aria-label={open ? 'Скрыть инструменты' : 'Показать инструменты'}
    >
      <IconChevronLeft />
    </button>
    </>
  );
}

interface ViewProps {
  canManage: boolean;
  /** Наблюдателю класть на доску нечего: у него нет права рисовать. */
  canEdit: boolean;
  /** Ставит закладку в этом месте — та же кнопка, что раньше стояла слева. */
  tool: Tool;
  onTool: (tool: Tool) => void;
  scale: number;
  onZoom: (factor: number) => void;
  onResetZoom: () => void;
  onFit: () => void;
  onBackground: () => void;
  onSummary: () => void;
  /** Сколько просьб о конспекте ждёт владельца — точкой на кнопке. */
  summaryCount: number;
  onTimer: () => void;
  onHelp: () => void;
  onExport: () => void;
  onClear: () => void;
  /** Вставить из буфера доски. Кнопки нет, пока в буфере пусто. */
  canPaste: boolean;
  onPaste: () => void;
  onPages: () => void;
  /** Какая страница открыта из скольких — прямо на кнопке. */
  pageLabel: string;
  onBookmarks: () => void;
  /** Переносит остальных участников на вид нажавшего. Владелец и редакторы. */
  onBringEveryone: () => void;
  /** Гостю записи не показываем: у него нет учётной записи для доступа к ним. */
  canRecordings: boolean;
  onRecordings: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  /** Значок кнопки сам меняется по состоянию — playстоп, пауза, идёт запись. */
  recordingStatus: 'recording' | 'paused' | null;
  /** Убрать с экрана на телефоне — на счету каждый пиксель холста. */
  open: boolean;
  onToggleOpen: () => void;
}

/** Масштаб и вид — горизонтальной полосой в правом верхнем углу холста. */
export function ViewToolbar({
  canManage, canEdit, tool, onTool, scale, onZoom, onResetZoom, onFit,
  onBackground, onSummary, summaryCount, onTimer, onHelp, onExport, onClear,
  canPaste, onPaste, onPages, pageLabel, onBookmarks, onBringEveryone,
  canRecordings, onRecordings, onPauseRecording, onResumeRecording, onStopRecording, recordingStatus,
  open, onToggleOpen,
}: ViewProps): ReactElement {
  return (
    <>
    <div
      className={open ? 'toolbar toolbar--view' : 'toolbar toolbar--view toolbar--collapsed'}
      role="toolbar" aria-label="Масштаб и вид"
    >
      {/* Масштаб доступен всем: наблюдателю он нужен ровно так же. */}
      <div className="zoom">
        <button className="btn-tool" type="button" onClick={() => onZoom(1 / 1.15)} aria-label="Отдалить" data-tip="Отдалить">−</button>
        <button className="zoom__value" type="button" onClick={onResetZoom} title="Вернуть 100 %" data-tip="Вернуть 100 %">
          {Math.round(scale * 100)} %
        </button>
        <button className="btn-tool" type="button" onClick={() => onZoom(1.15)} aria-label="Приблизить" data-tip="Приблизить">+</button>
        <button className="btn-tool" type="button" onClick={onFit} title="Показать всё нарисованное" data-tip="Показать всё нарисованное">⤢</button>
      </div>

      <span className="toolbar__divider" aria-hidden="true" />

      {/* Страницы рядом с масштабом: и то и другое — про то, на что
          человек сейчас смотрит, а не про то, чем рисует. */}
      <button className="btn-tool btn-tool--wide" type="button" onClick={onPages} title="Страницы занятия" data-tip="Страницы занятия">
        <IconPages />
        <span className="btn-tool__label">{pageLabel}</span>
      </button>

      {/* Рядом со страницами: и то и другое — про то, куда попасть на
          доске, а не про то, чем на ней рисуют. */}
      <button className="btn-tool" type="button" onClick={onBookmarks} title="Закладки" data-tip="Закладки">
        <IconBookmark />
      </button>

      {/* Поставить закладку — рядом со списком закладок: две стороны
          одного дела, а не рисование, поэтому и не в левой панели. */}
      {canEdit ? (
        <button
          className="btn-tool" type="button"
          aria-pressed={tool === 'bookmark'}
          onClick={() => onTool('bookmark')}
          title="Закладка: подписанная метка в этом месте" data-tip="Закладка: подписанная метка в этом месте"
        >
          <IconBookmark />
        </button>
      ) : null}

      <span className="toolbar__divider" aria-hidden="true" />

      <button className="btn-tool" type="button" onClick={onHelp} title="Что умеет доска" data-tip="Что умеет доска">
        <IconHelp />
      </button>

      <button className="btn-tool" type="button" onClick={onTimer} title="Таймер" data-tip="Таймер">
        <IconTimer />
      </button>

      {/* Владелец и редакторы: перенос вида — часть ведения занятия,
          а не рисования, но право на неё то же. */}
      {canEdit ? (
        <button
          className="btn-tool" type="button" onClick={onBringEveryone}
          title="Все ко мне: перенести всех участников на этот вид"
          data-tip="Все ко мне: перенести всех участников на этот вид"
        >
          <IconTarget />
        </button>
      ) : null}

      {/* Вставка отдельной кнопкой: на планшете Ctrl+V нажать нечем. */}
      {canPaste ? (
        <button className="btn-tool" type="button" onClick={onPaste} title="Вставить из буфера доски (Ctrl+V)" data-tip="Вставить из буфера доски (Ctrl+V)">
          <IconPaste />
        </button>
      ) : null}

      {/* Записи рядом с конспектом: и то и другое — след занятия, который
          можно открыть потом, а не то, что делают на самом холсте.
          Пока не записывают — одна кнопка на панель записей. Как только
          запись пошла, для владельца это уже не кнопка открытия панели, а
          прямое управление: пауза/продолжить и стоп, без лишнего клика в
          панель. Наблюдателю панель ничего не даст (управляет только
          владелец), поэтому ему оставлена только метка «идёт запись». */}
      {canRecordings && canManage && recordingStatus !== null ? (
        <>
          {recordingStatus === 'recording' ? (
            <button className="btn-tool" type="button" onClick={onPauseRecording} title="Пауза" data-tip="Пауза">
              <IconPause />
            </button>
          ) : (
            <button className="btn-tool" type="button" onClick={onResumeRecording} title="Продолжить" data-tip="Продолжить">
              <IconPlay />
            </button>
          )}
          <button className="btn-tool" type="button" onClick={onStopRecording} title="Стоп" data-tip="Стоп">
            <IconStop />
          </button>
        </>
      ) : canRecordings ? (
        <button
          className="btn-tool" type="button" onClick={onRecordings}
          title="Записи занятия" data-tip="Записи занятия"
        >
          {recordingStatus === 'paused' ? <IconPause /> : <IconRecord />}
        </button>
      ) : null}

      {/* Конспект рядом с сохранением: и то и другое — «забрать занятие
          с собой», разница только в том, себе на диск или письмом. */}
      <button className="btn-tool" type="button" onClick={onSummary} title="Конспект занятия по почте" data-tip="Конспект занятия по почте">
        <IconMail />
        {summaryCount > 0 ? <span className="badge-dot">{summaryCount}</span> : null}
      </button>

      {/* Сохранить картинкой может любой: это его же занятие. */}
      <button className="btn-tool" type="button" onClick={onExport} title="Сохранить картинкой" data-tip="Сохранить картинкой">
        <IconDownload />
      </button>

      {canManage ? (
        <>
          <button className="btn-tool" type="button" onClick={onBackground} title="Фон и разлиновка" data-tip="Фон и разлиновка">
            <IconGrid />
          </button>
          <button className="btn-tool" type="button" onClick={onClear} title="Очистить страницу" data-tip="Очистить страницу">
            <IconTrash />
          </button>
        </>
      ) : null}
    </div>

    {/* Только на телефоне: на большом экране панель не загораживает
        ничего и убирать её незачем. */}
    <button
      type="button"
      className={open ? 'toolbar-toggle toolbar-toggle--view' : 'toolbar-toggle toolbar-toggle--view toolbar-toggle--closed'}
      onClick={onToggleOpen}
      aria-expanded={open}
      aria-label={open ? 'Скрыть панель масштаба и вида' : 'Показать панель масштаба и вида'}
    >
      <IconChevronDown />
    </button>
    </>
  );
}
