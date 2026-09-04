import type { ReactElement } from 'react';
import {
  IconCursor, IconEditor, IconEraser, IconHand, IconMarker,
  IconDownload, IconGrid, IconHelp, IconImage, IconTimer, IconRedo, IconShapes, IconTable, IconText,
  IconTrash, IconUndo, IconPaste, IconPages, IconLibrary,
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
}

/**
 * Инструменты рисования — вертикальной полосой слева от холста.
 *
 * Повторный щелчок по уже выбранному рисующему инструменту открывает его
 * параметры: так настройка не занимает отдельной кнопки, а до неё всё
 * равно один щелчок.
 */
export function DrawToolbar({
  tool, settings, canEdit, canUndo, canRedo, onTool, onUndo, onRedo,
}: ToolProps): ReactElement {
  const pick = (which: Tool, icon: ReactElement, title: string, needsEdit = true) => {
    const dot = toolColor(which, settings);

    return (
      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === which}
        onClick={() => onTool(which)}
        disabled={needsEdit && !canEdit}
        title={needsEdit && !canEdit ? 'Доступно редактору' : title}
      >
        {icon}
        {dot ? <span className="tool-dot" style={{ background: dot }} aria-hidden="true" /> : null}
      </button>
    );
  };

  return (
    <div className="toolbar toolbar--vertical" role="toolbar" aria-label="Инструменты рисования">
      <button
        className="btn-tool" type="button" onClick={onUndo}
        disabled={!canEdit || !canUndo} title="Отменить (Ctrl+Z)" aria-label="Отменить"
      >
        <IconUndo />
      </button>

      <button
        className="btn-tool" type="button" onClick={onRedo}
        disabled={!canEdit || !canRedo} title="Повторить (Ctrl+Y)" aria-label="Повторить"
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
    </div>
  );
}

interface ViewProps {
  canManage: boolean;
  /** Наблюдателю класть на доску нечего: у него нет права рисовать. */
  canEdit: boolean;
  /** Гостю загрузка закрыта: файлы кладут только те, у кого есть учётная запись. */
  canUpload: boolean;
  scale: number;
  onZoom: (factor: number) => void;
  onResetZoom: () => void;
  onFit: () => void;
  onBackground: () => void;
  onFiles: () => void;
  onLibrary: () => void;
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
}

/** Масштаб и вид — горизонтальной полосой в правом верхнем углу холста. */
export function ViewToolbar({
  canManage, canEdit, canUpload, scale, onZoom, onResetZoom, onFit,
  onBackground, onFiles, onLibrary, onTimer, onHelp, onExport, onClear,
  canPaste, onPaste, onPages, pageLabel,
}: ViewProps): ReactElement {
  return (
    <div className="toolbar toolbar--view" role="toolbar" aria-label="Масштаб и вид">
      {/* Масштаб доступен всем: наблюдателю он нужен ровно так же. */}
      <div className="zoom">
        <button className="btn-tool" type="button" onClick={() => onZoom(1 / 1.15)} aria-label="Отдалить">−</button>
        <button className="zoom__value" type="button" onClick={onResetZoom} title="Вернуть 100 %">
          {Math.round(scale * 100)} %
        </button>
        <button className="btn-tool" type="button" onClick={() => onZoom(1.15)} aria-label="Приблизить">+</button>
        <button className="btn-tool" type="button" onClick={onFit} title="Показать всё нарисованное">⤢</button>
      </div>

      <span className="toolbar__divider" aria-hidden="true" />

      {/* Страницы рядом с масштабом: и то и другое — про то, на что
          человек сейчас смотрит, а не про то, чем рисует. */}
      <button className="btn-tool btn-tool--wide" type="button" onClick={onPages} title="Страницы занятия">
        <IconPages />
        <span className="btn-tool__label">{pageLabel}</span>
      </button>

      <span className="toolbar__divider" aria-hidden="true" />

      <button className="btn-tool" type="button" onClick={onHelp} title="Что умеет доска">
        <IconHelp />
      </button>

      <button className="btn-tool" type="button" onClick={onTimer} title="Таймер">
        <IconTimer />
      </button>

      {canUpload ? (
        <button className="btn-tool" type="button" onClick={onFiles} title="Вставить файл или страницу PDF">
          <IconImage />
        </button>
      ) : null}

      {/* Заготовки рядом с файлами: и то и другое — «положить на доску
          готовое», а не «нарисовать самому». */}
      {canEdit ? (
        <button className="btn-tool" type="button" onClick={onLibrary} title="Заготовки: чертежи, знаки, формулы">
          <IconLibrary />
        </button>
      ) : null}

      {/* Вставка отдельной кнопкой: на планшете Ctrl+V нажать нечем. */}
      {canPaste ? (
        <button className="btn-tool" type="button" onClick={onPaste} title="Вставить из буфера доски (Ctrl+V)">
          <IconPaste />
        </button>
      ) : null}

      {/* Сохранить картинкой может любой: это его же занятие. */}
      <button className="btn-tool" type="button" onClick={onExport} title="Сохранить картинкой">
        <IconDownload />
      </button>

      {canManage ? (
        <>
          <button className="btn-tool" type="button" onClick={onBackground} title="Фон и разлиновка">
            <IconGrid />
          </button>
          <button className="btn-tool" type="button" onClick={onClear} title="Очистить страницу">
            <IconTrash />
          </button>
        </>
      ) : null}
    </div>
  );
}
