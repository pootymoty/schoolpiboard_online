import type { ReactElement } from 'react';
import type { BoardItem } from './protocol';
import type { Bounds } from './geometry';
import { PALETTE } from './tools';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';
import { Menu } from '../components/Menu';
import { IconCopy, IconToBack, IconToFront, IconTrash } from '../components/Icons';

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
  onCopyText: (text: string) => void;
}

/** Примерная ширина панели — по ней она прижимается к краям холста. */
const WIDTH = 260;

/** Примерная высота панели — по ней считается, влезает ли она над выделением. */
const HEIGHT = 48;

/** Полоса слева, занятая вертикальной панелью инструментов. */
const LEFT_GUTTER = 72;

/** Полоса снизу, занятая кнопкой «Участники» и подсказкой гостю. */
const BOTTOM_GUTTER = 60;

/**
 * Ниже этой ширины панель перестаёт летать над выделением и садится
 * полосой у нижнего края холста.
 *
 * На маленьком экране выделенное часто оказывается под панелью или за
 * краем, и панель приходилось бы искать. Двигать ради неё сам холст
 * нельзя: на большом экране это дёргало бы вид без всякой нужды.
 */
const NARROW = 720;

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
  items, bounds, viewport, canvas, onColor, onDuplicate, onDelete, onReorder, onCopyText,
}: Props): ReactElement {
  // Надпись — единственное, что имеет смысл забрать с доски текстом.
  // На телефоне выделить её иначе нечем: холст рисованный, а не вёрстка.
  const text = items.length === 1 && items[0].type === 'text' ? items[0].data.text ?? '' : null;
  const pinned = canvas.width > 0 && canvas.width < NARROW;

  const corner = toScreen(viewport, bounds.x, bounds.y);
  const width = bounds.width * viewport.scale;

  // Над выделением, а если места сверху нет — под ним: иначе панель
  // уезжает за верхний край холста и становится недоступной.
  const above = corner.y - 8 - HEIGHT >= 8;

  // Слева отступаем от вертикальной панели инструментов, снизу — от
  // кнопки участников: панель поверх них хоть и видна, но закрывает то,
  // чем в этот момент тоже пользуются.
  const left = Math.max(
    LEFT_GUTTER + WIDTH / 2,
    Math.min(corner.x + width / 2, canvas.width - WIDTH / 2 - 8),
  );

  const top = Math.max(
    8,
    Math.min(
      above ? corner.y - 8 - HEIGHT : corner.y + bounds.height * viewport.scale + 8,
      canvas.height - BOTTOM_GUTTER - HEIGHT,
    ),
  );

  return (
    <div
      className={pinned ? 'selection-panel selection-panel--pinned' : 'selection-panel'}
      style={pinned ? undefined : { left, top, transform: 'translateX(-50%)' }}
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

      {pinned ? (
        // На телефоне три точки только путали: на что там жать, было не
        // понять без подписи. Прокручиваемый ряд кнопок — тот же приём,
        // что уже прижился в панели инструментов.
        <>
          <button className="btn-tool" type="button" onClick={() => onReorder(true)} title="На передний план">
            <IconToFront />
          </button>
          <button className="btn-tool" type="button" onClick={() => onReorder(false)} title="На задний план">
            <IconToBack />
          </button>
          {text ? (
            <button className="btn-tool" type="button" onClick={() => onCopyText(text)} title="Скопировать текст">
              <IconCopy />
            </button>
          ) : null}
        </>
      ) : (
        // На ПК места хватает — а вот словесная подпись читается быстрее,
        // чем два похожих значка «вперёд»/«назад» по слою.
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
          {text ? (
            <button className="btn-quiet menu__item" type="button" onClick={() => onCopyText(text)}>
              Скопировать текст
            </button>
          ) : null}
          <button className="btn-quiet menu__item menu__item--danger" type="button" onClick={onDelete}>
            Удалить
          </button>
        </Menu>
      )}

      {items.length > 1 ? <span className="selection-panel__count">{items.length}</span> : null}
    </div>
  );
}
