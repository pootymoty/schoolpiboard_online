import type { ReactElement } from 'react';
import type { Tool } from './BoardCanvas';
import { IconEditor, IconEraser, IconTrash } from '../components/Icons';

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
  canManage: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onClear: () => void;
}

export function BoardToolbar({
  tool, color, width, canManage, onTool, onColor, onWidth, onClear,
}: Props): ReactElement {
  return (
    <div className="toolbar" role="toolbar" aria-label="Инструменты доски">
      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === 'pen'}
        onClick={() => onTool('pen')}
        title="Рисовать"
      >
        <IconEditor />
      </button>

      <button
        className="btn-tool"
        type="button"
        aria-pressed={tool === 'eraser'}
        onClick={() => onTool('eraser')}
        title="Стирать"
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
          onClick={() => onWidth(value)}
        >
          <span className="width-dot" style={{ width: value * 2, height: value * 2 }} />
        </button>
      ))}

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
