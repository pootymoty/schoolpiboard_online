import type { ReactElement } from 'react';
import type { BoardItem } from './protocol';
import type { Bounds } from './geometry';
import { PALETTE } from './tools';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';
import { IconCopy, IconToBack, IconToFront, IconTrash } from '../components/Icons';

interface Props {
  items: BoardItem[];
  bounds: Bounds;
  viewport: Viewport;
  onColor: (color: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (toFront: boolean) => void;
}

/**
 * Действия над выделенным — над самим выделением.
 *
 * Не в общей панели инструментов: там их пришлось бы искать глазами, а
 * здесь они там же, куда человек только что смотрел.
 */
export function SelectionPanel({
  items, bounds, viewport, onColor, onDuplicate, onDelete, onReorder,
}: Props): ReactElement {
  const corner = toScreen(viewport, bounds.x, bounds.y);
  const width = bounds.width * viewport.scale;

  // Над выделением, а если места сверху нет — под ним: иначе панель
  // уезжает за верхний край холста и становится недоступной.
  const above = corner.y > 56;

  return (
    <div
      className="selection-panel"
      style={{
        left: Math.max(0, corner.x + width / 2),
        top: above ? corner.y - 8 : corner.y + bounds.height * viewport.scale + 8,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
      role="toolbar"
      aria-label="Действия с выделенным"
    >
      <div className="selection-panel__colors">
        {PALETTE.slice(0, 6).map((value) => (
          <button
            key={value}
            className="swatch swatch--sm"
            type="button"
            aria-label={`Цвет ${value}`}
            style={{ background: value }}
            onClick={() => onColor(value)}
          />
        ))}
      </div>

      <span className="toolbar__divider" aria-hidden="true" />

      <button className="btn-tool" type="button" onClick={() => onReorder(true)} title="На передний план">
        <IconToFront />
      </button>
      <button className="btn-tool" type="button" onClick={() => onReorder(false)} title="На задний план">
        <IconToBack />
      </button>
      <button className="btn-tool" type="button" onClick={onDuplicate} title="Дублировать (Ctrl+D)">
        <IconCopy />
      </button>
      <button className="btn-tool" type="button" onClick={onDelete} title="Удалить (Delete)">
        <IconTrash />
      </button>

      <span className="selection-panel__count">{items.length > 1 ? items.length : ''}</span>
    </div>
  );
}
