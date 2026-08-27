import type { ReactElement } from 'react';
import type { BoardItem } from './protocol';
import type { Bounds } from './geometry';
import { PALETTE } from './tools';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';
import { Menu } from '../components/Menu';
import { IconCopy, IconTrash } from '../components/Icons';

interface Props {
  items: BoardItem[];
  bounds: Bounds;
  viewport: Viewport;
  /** Габариты холста: панель не должна уезжать за его край. */
  canvas: { width: number; height: number };
  onColor: (color: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (toFront: boolean) => void;
}

/** Примерная ширина панели — по ней она прижимается к краям холста. */
const WIDTH = 260;

/**
 * Действия над выделенным — над самим выделением.
 *
 * Не в общей панели инструментов: там их пришлось бы искать глазами, а
 * здесь они там же, куда человек только что смотрел.
 *
 * Порядок слоёв убран под три точки и назван словами: значок «на
 * передний план» от «на задний план» отличается настолько, что читать
 * его приходится дольше, чем подпись.
 */
export function SelectionPanel({
  items, bounds, viewport, canvas, onColor, onDuplicate, onDelete, onReorder,
}: Props): ReactElement {
  const corner = toScreen(viewport, bounds.x, bounds.y);
  const width = bounds.width * viewport.scale;

  // Над выделением, а если места сверху нет — под ним: иначе панель
  // уезжает за верхний край холста и становится недоступной.
  const above = corner.y > 56;

  const left = Math.max(
    WIDTH / 2 + 8,
    Math.min(corner.x + width / 2, canvas.width - WIDTH / 2 - 8),
  );

  return (
    <div
      className="selection-panel"
      style={{
        left,
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

      <button className="btn-tool" type="button" onClick={onDuplicate} title="Дублировать (Ctrl+D)">
        <IconCopy />
      </button>
      <button className="btn-tool" type="button" onClick={onDelete} title="Удалить (Delete)">
        <IconTrash />
      </button>

      <Menu label="Ещё действия">
        <button className="btn-quiet menu__item" type="button" onClick={() => onReorder(true)}>
          На передний план
        </button>
        <button className="btn-quiet menu__item" type="button" onClick={() => onReorder(false)}>
          На задний план
        </button>
        <button className="btn-quiet menu__item" type="button" onClick={onDuplicate}>
          Дублировать
        </button>
        <button className="btn-quiet menu__item menu__item--danger" type="button" onClick={onDelete}>
          Удалить
        </button>
      </Menu>

      {items.length > 1 ? <span className="selection-panel__count">{items.length}</span> : null}
    </div>
  );
}
