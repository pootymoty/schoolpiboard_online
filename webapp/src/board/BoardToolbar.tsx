import type { ReactElement } from 'react';
import type { Tool } from './BoardCanvas';
import { IconCursor, IconEditor, IconEraser, IconHand, IconRedo, IconTrash, IconUndo } from '../components/Icons';

/**
 * Цвета доски. Немного и заметно разных: палитра на сотню оттенков
 * заставляет выбирать вместо того, чтобы объяснять.
 */
const COLORS = ['#2A211C', '#B03A2E', '#1F618D', '#1E8449', '#B7950B'];

/** Толщины: тонко — писать, средне — рисовать, толсто — выделять. */
const WIDTHS = [2, 4, 8];

interface Props {
  tool: Tool;
  color: string;
  width: number;
  /** Наблюдателю доступна только навигация — остальное заблокировано. */
  canEdit: boolean;
  canManage: boolean;
  scale: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onZoom: (factor: number) => void;
  onResetZoom: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BoardToolbar({
  tool, color, width, canEdit, canManage, scale, canUndo, canRedo, hasSelection,
  onTool, onColor, onWidth, onZoom, onResetZoom, onFit, onUndo, onRedo, onDelete, onClear,
}: Props): ReactElement {
  return (
    <div className="toolbar" role="toolbar" aria-label="Инструменты доски">
      <button
        className="btn-tool"
        type="button"
        onClick={onUndo}
        disabled={!canEdit || !canUndo}
        title="Отменить (Ctrl+Z)"
        aria-label="Отменить"
      >
        <IconUndo />
      </button>

      <button
        className="btn-tool"
        type="button"
        onClick={onRedo}
        disabled={!canEdit || !canRedo}
        title="Повторить (Ctrl+Y)"
        aria-label="Повторить"
      >
        <IconRedo />
      </button>

      <span className="toolbar__divider" aria-hidden="true" />

      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === 'select'}
        onClick={() => onTool('select')}
        disabled={!canEdit}
        title={canEdit ? 'Выделять и перемещать' : 'Выделять может редактор'}
      >
        <IconCursor />
      </button>

      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === 'hand'}
        onClick={() => onTool('hand')}
        title="Двигать холст. То же — пробел или средняя кнопка мыши"
      >
        <IconHand />
      </button>

      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === 'pen'}
        onClick={() => onTool('pen')}
        disabled={!canEdit}
        title={canEdit ? 'Рисовать' : 'Рисовать может редактор'}
      >
        <IconEditor />
      </button>

      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === 'eraser'}
        onClick={() => onTool('eraser')}
        disabled={!canEdit}
        title={canEdit ? 'Стирать' : 'Стирать может редактор'}
      >
        <IconEraser />
      </button>

      <span className="toolbar__divider" aria-hidden="true" />

      {COLORS.map((value) => (
        <button
          key={value}
          className="swatch"
          type="button"
          aria-pressed={color === value}
          aria-label={`Цвет ${value}`}
          disabled={!canEdit}
          style={{ background: value }}
          onClick={() => onColor(value)}
        />
      ))}

      <span className="toolbar__divider" aria-hidden="true" />

      {WIDTHS.map((value) => (
        <button
          key={value}
          className="btn-tool"
          type="button"
          aria-pressed={width === value}
          aria-label={`Толщина ${value}`}
          disabled={!canEdit}
          onClick={() => onWidth(value)}
        >
          <span className="width-dot" style={{ width: value * 2, height: value * 2 }} />
        </button>
      ))}

      {hasSelection ? (
        <>
          <span className="toolbar__divider" aria-hidden="true" />
          <button className="btn-tool" type="button" onClick={onDelete} title="Удалить выделенное (Delete)">
            <IconTrash />
          </button>
        </>
      ) : null}

      <span className="toolbar__spacer" />

      {/* Масштаб доступен всем: наблюдателю он нужен ровно так же. */}
      <div className="zoom">
        <button className="btn-tool" type="button" onClick={() => onZoom(1 / 1.15)} aria-label="Отдалить">−</button>
        <button
          className="zoom__value"
          type="button"
          onClick={onResetZoom}
          title="Вернуть 100 %"
        >
          {Math.round(scale * 100)} %
        </button>
        <button className="btn-tool" type="button" onClick={() => onZoom(1.15)} aria-label="Приблизить">+</button>
        <button className="btn-tool" type="button" onClick={onFit} title="Показать всё нарисованное">⤢</button>
      </div>

      {canManage ? (
        <>
          <span className="toolbar__divider" aria-hidden="true" />
          <button className="btn-tool" type="button" onClick={onClear} title="Очистить доску">
            <IconTrash />
          </button>
        </>
      ) : null}
    </div>
  );
}
