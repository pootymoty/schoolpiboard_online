import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { BoardItem, ItemData } from './protocol';
import type { Bounds } from './geometry';
import { LINE_STYLES, SIZES } from './tools';
import { ColorPick } from './ColorPick';
import { segmentsOf } from './strokes';
import { LineStyleIcon } from './ShapeIcons';
import { DEFAULT_COLS, DEFAULT_ROWS, MAX_COLS, MAX_ROWS, clampCols, clampRows } from './tables';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';
import {
  IconCheck, IconCopy, IconCopyText, IconDuplicate, IconLibrary, IconLockClosed, IconLockOpen,
  IconToBack, IconToFront, IconTrash,
} from '../components/Icons';
import { saveTemplate } from '../api/templates';
import { ApiError } from '../api/client';
import { useDragShift } from './dragShift';
import type { DragShift } from './dragShift';

interface Props {
  items: BoardItem[];
  bounds: Bounds;
  /** Сдвиг, пока выделение тащат: панель едет вместе с ним. */
  dragShift?: DragShift;
  viewport: Viewport;
  /** Габариты холста: панель не должна уезжать за его край. */
  canvas: { width: number; height: number };
  onColor: (color: string) => void;
  /**
   * Поменять у выделенного свои параметры — толщину, тип линии, заливку,
   * размер шрифта. Те же, что задаются инструменту перед вставкой: что
   * можно было выбрать до, то можно и поправить после.
   */
  onPatch: (patch: Partial<ItemData>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (toFront: boolean) => void;
  onCopyText: (text: string) => void;
  /** Снять выделение: на телефоне это ещё и «верни панель инструментов». */
  onDone: () => void;
  /** Изменить размерность выбранной таблицы. */
  onTable: (rows: number, cols: number) => void;
  /** Запереть или отпереть выделенное. */
  onLock: (locked: boolean) => void;
  /** Положить выделенное в буфер доски. */
  onCopy: () => void;
  /** Гостю заготовки недоступны: хранить их было бы не за кем. */
  canKeep: boolean;
}

/** Примерная ширина панели — по ней она прижимается к краям холста. */
const WIDTH = 340;

/**
 * Высота панели до первого измерения.
 *
 * Дальше берётся настоящая: панель то в одну строку, то в три — с
 * палитрой, размерностью таблицы и кнопками, — и по угаданной высоте она
 * ложилась прямо на маленький объект, который человек только что выбрал.
 */
const HEIGHT = 150;

/** Полоса слева, занятая вертикальной панелью инструментов. */
const LEFT_GUTTER = 72;

/** Полоса снизу, занятая кнопкой «Участники» и подсказкой гостю. */
const BOTTOM_GUTTER = 60;

/**
 * Ниже этой ширины панель встаёт на место вертикальной панели
 * инструментов, слева.
 *
 * Летающая панель на телефоне оказывалась то под пальцем, то за краем;
 * полоса у нижнего края закрывала кнопку участников. А место слева в этот
 * момент занято тем, что всё равно не нужно: пока объект выбран, человек
 * работает с ним, а не выбирает перо. Кнопка «Готово» снимает выделение
 * и возвращает инструменты.
 */
const NARROW = 720;

/**
 * Ниже этой высоты холста — тоже слева (телефон, повёрнутый набок):
 * летающая панель с параметрами над невысоким холстом не помещалась бы
 * ни над объектом, ни под ним.
 */
const SHORT = 460;


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
  items, bounds: rest, dragShift, viewport, canvas, onColor, onPatch, onDuplicate, onDelete, onReorder, onCopyText, onDone,
  onTable, onLock, onCopy, canKeep,
}: Props): ReactElement {
  // Надпись и закладка — единственное, что имеет смысл забрать с доски
  // текстом. На телефоне выделить его иначе нечем: холст рисованный,
  // а не вёрстка.
  const text = items.length === 1 && (items[0].type === 'text' || items[0].type === 'bookmark')
    ? items[0].data.text ?? ''
    : null;

  // Картинки в шаблон не идут: файл принадлежит своей доске, а не
  // человеку, — тот же список, что уходит в панель «Шаблоны».
  const keepable = items.filter((item) => item.type !== 'image');

  const [naming, setNaming] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);

  const saveAsTemplate = () => {
    if (templateBusy) return;

    setTemplateBusy(true);
    setTemplateNote(null);

    saveTemplate(templateTitle.trim(), keepable.map((item) => ({ type: item.type, data: item.data })))
      .then(() => {
        setNaming(false);
        setTemplateTitle('');
      })
      .catch((reason) => setTemplateNote(reason instanceof ApiError ? reason.message : 'Не удалось сохранить.'))
      .finally(() => setTemplateBusy(false));
  };

  // Строки и столбцы правятся у выбранной таблицы, а не при построении:
  // сколько их нужно, обычно выясняется уже по ходу заполнения.
  // Заперто, если заперто всё выделенное: иначе кнопка отпирала бы одно
  // и запирала другое одним нажатием.
  const locked = items.length > 0 && items.every((item) => item.data.locked);

  const table = items.length === 1 && items[0].type === 'table' ? items[0] : null;
  const rows = table ? clampRows(table.data.rows ?? DEFAULT_ROWS) : 0;
  const cols = table ? clampCols(table.data.cols ?? DEFAULT_COLS) : 0;
  const docked = canvas.width > 0 && (canvas.width < NARROW || canvas.height < SHORT);

  /**
   * Тип выделенного — если он у всего выделенного один: только тогда
   * есть общие для всех параметры. У пестрой группы (штрих и надпись)
   * остаётся лишь цвет.
   */
  const kind = items.length > 0 && items.every((item) => item.type === items[0].type) ? items[0].type : null;

  /**
   * Прямая, проведённая пером (с Shift или задержкой руки), — такой же
   * отрезок, как фигура «Линия», только лежит штрихом из двух точек.
   * Тип линии ей нужен ровно так же: как бы прямую ни построили, править
   * её можно одинаково.
   */
  const straight = kind === 'stroke' && items.every((item) => {
    // После ластика прямая лежит несколькими отрезками по две точки —
    // это всё ещё прямая.
    const pieces = segmentsOf(item.data);
    return pieces.length > 0 && pieces.every((piece) => piece.length === 2);
  });

  /** Заливка имеет смысл только у замкнутых фигур. */
  const fillable = items.every((item) => item.data.shape !== 'line' && item.data.shape !== 'arrow');

  /** Значение, общее для всего выделенного, — им отмечена нажатая кнопка. */
  const common = <T,>(read: (item: BoardItem) => T): T | undefined => {
    const first = items[0] ? read(items[0]) : undefined;
    return items.every((item) => read(item) === first) ? first : undefined;
  };

  const color = common((item) => item.data.color);
  const fill = common((item) => item.data.fill ?? '');


  /**
   * Подпись под значком — только в узкой панели.
   *
   * На телефоне у кнопок нет ни наведения, ни места для всплывающей
   * подсказки, а восемь значков подряд читаются дольше, чем слово.
   * В широкой панели значки стоят в ряд с подсказками, и подписи там
   * только растянули бы её через весь холст.
   */
  const cap = (text: string) => (docked ? <span className="btn-tool__cap">{text}</span> : null);

  /**
   * Настоящая высота панели.
   *
   * Меряем после отрисовки: состав панели меняется от того, что выбрано,
   * и заранее её высоту не знает никто. По угаданной панель наезжала на
   * невысокий объект — тот самый, который только что выбрали.
   */
  const panel = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(HEIGHT);

  useLayoutEffect(() => {
    const measured = panel.current?.offsetHeight;
    if (measured && Math.abs(measured - height) > 1) setHeight(measured);
  });

  const shift = useDragShift(dragShift);
  const bounds = shift.dx === 0 && shift.dy === 0 ? rest : { ...rest, x: rest.x + shift.dx, y: rest.y + shift.dy };

  const corner = toScreen(viewport, bounds.x, bounds.y);
  const width = bounds.width * viewport.scale;

  /** Зазор между панелью и объектом: впритык они читаются как одно целое. */
  const GAP = 10;

  // Над выделением, а если места сверху нет — под ним: иначе панель
  // уезжает за верхний край холста и становится недоступной.
  const above = corner.y - GAP - height >= 8;

  // Слева отступаем от вертикальной панели инструментов, снизу — от
  // кнопки участников: панель поверх них хоть и видна, но закрывает то,
  // чем в этот момент тоже пользуются.
  const left = Math.max(
    LEFT_GUTTER + WIDTH / 2,
    Math.min(corner.x + width / 2, canvas.width - WIDTH / 2 - 8),
  );

  // Снизу панель ставится ниже нижней границы объекта, а не «где-нибудь
  // под ним»: иначе у невысокого выделения она перекрывала его целиком.
  const below = corner.y + bounds.height * viewport.scale + GAP;

  const top = Math.max(
    8,
    Math.min(above ? corner.y - GAP - height : below, canvas.height - BOTTOM_GUTTER - height),
  );

  return (
    <div
      ref={panel}
      className={docked ? 'selection-panel selection-panel--docked' : 'selection-panel'}
      style={docked ? undefined : { left, top, transform: 'translateX(-50%)' }}
      role="toolbar"
      aria-label="Действия с выделенным"
    >
      {/* Сначала цвет, сразу под ним — свои параметры выбранного (толщина,
          тип линии, заливка, шрифт, размерность таблицы), потом действия.
          Палитра та же, что у инструментов: перекрасить выбранное и
          нарисовать новое — одно и то же действие, и цвета в них должны
          совпадать, иначе подобранный оттенок не повторить. */}
      {/* Палитра свёрнута в один кружок текущего цвета: развёрнутые
          сразу цвет и заливка — это три десятка кружков, и на телефоне
          кнопки действий уезжали далеко вниз. */}
      <ColorPick label="Цвет" value={color} onChange={onColor} commitOnClose small />

      {kind === 'stroke' || kind === 'shape' ? (
        <div className="selection-panel__section">
          <span className="selection-panel__label">Толщина</span>
          <div className="selection-panel__options">
            {SIZES.map((value) => (
              <button
                key={value}
                className="btn-tool btn-tool--tiny"
                type="button"
                aria-pressed={common((item) => item.data.width) === value}
                aria-label={`Толщина ${value}`}
                title={`Толщина ${value}`}
                onClick={() => onPatch({ width: value })}
              >
                <span className="width-dot" style={{ width: Math.min(16, Math.max(3, value / 1.6)), height: Math.min(16, Math.max(3, value / 1.6)) }} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {kind === 'shape' || straight ? (
        <div className="selection-panel__section">
          <span className="selection-panel__label">Линия</span>
          <div className="selection-panel__options">
            {LINE_STYLES.map((style) => (
              <button
                key={style.kind}
                className="btn-tool btn-tool--tiny btn-tool--line"
                type="button"
                aria-pressed={(common((item) => item.data.lineStyle ?? 'solid')) === style.kind}
                aria-label={style.label}
                title={style.label}
                onClick={() => onPatch({ lineStyle: style.kind })}
              >
                <LineStyleIcon kind={style.kind} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {kind === 'shape' && fillable ? (
        <ColorPick label="Заливка" value={fill} none onChange={(value) => onPatch({ fill: value })} commitOnClose small />
      ) : null}

      {kind === 'text' || kind === 'table' ? (
        <div className="selection-panel__section">
          <span className="selection-panel__label">Шрифт</span>
          <div className="selection-panel__options">
            {(kind === 'text' ? [16, 20, 24, 32, 48, 64] : [14, 16, 20, 24, 32]).map((value) => (
              <button
                key={value}
                className="btn-tool btn-tool--tiny"
                type="button"
                aria-pressed={common((item) => item.data.fontSize) === value}
                title={`Размер шрифта ${value}`}
                onClick={() => onPatch({ fontSize: value })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {table ? (
        <div className="selection-panel__section">
          {/* Под кнопками стоит название того, что они меняют, а
              размерность — отдельной строкой внизу. Прежде размерность
              стояла в одной строке со строками, а слово «столбцы» — в
              другой, и понять, что именно меняется, было нельзя. */}
          <div className="selection-panel__sizes">
            <div className="selection-panel__table">
              <button
                className="btn-tool btn-tool--tiny"
                type="button"
                aria-label="Убрать строку"
                title="Убрать строку"
                disabled={rows <= 1}
                onClick={() => onTable(rows - 1, cols)}
              >
                −
              </button>
              <span className="selection-panel__what">Строки</span>
              <button
                className="btn-tool btn-tool--tiny"
                type="button"
                aria-label="Добавить строку"
                title="Добавить строку"
                disabled={rows >= MAX_ROWS}
                onClick={() => onTable(rows + 1, cols)}
              >
                +
              </button>
            </div>

            <div className="selection-panel__table">
              <button
                className="btn-tool btn-tool--tiny"
                type="button"
                aria-label="Убрать столбец"
                title="Убрать столбец"
                disabled={cols <= 1}
                onClick={() => onTable(rows, cols - 1)}
              >
                −
              </button>
              <span className="selection-panel__what">Столбцы</span>
              <button
                className="btn-tool btn-tool--tiny"
                type="button"
                aria-label="Добавить столбец"
                title="Добавить столбец"
                disabled={cols >= MAX_COLS}
                onClick={() => onTable(rows, cols + 1)}
              >
                +
              </button>
            </div>

            <span className="selection-panel__size">{rows} × {cols}</span>
          </div>
        </div>
      ) : null}

      {/* Действия — одним рядом (на телефоне — столбиком, с подписями):
          копия, дубль, вперёд, назад, шаблон, удалить, готово. Скопировать
          текст и замок — перед удалением: они нужны реже, но прятать их
          под три точки значило бы снова искать их глазами. */}
      <div className="selection-panel__actions">
        <button className="btn-tool" type="button" onClick={onCopy} title="Копировать (Ctrl+C)">
          <IconCopy />
          {cap('Копия')}
        </button>

        {locked ? null : (
          <button className="btn-tool" type="button" onClick={onDuplicate} title="Дублировать (Ctrl+D)">
            <IconDuplicate />
            {cap('Дубль')}
          </button>
        )}

        <button className="btn-tool" type="button" onClick={() => onReorder(true)} title="На передний план">
          <IconToFront />
          {cap('Вперёд')}
        </button>
        <button className="btn-tool" type="button" onClick={() => onReorder(false)} title="На задний план">
          <IconToBack />
          {cap('Назад')}
        </button>

        {canKeep && keepable.length > 0 ? (
          <button
            className="btn-tool" type="button" onClick={() => setNaming(true)}
            title="Сохранить как шаблон"
          >
            <IconLibrary />
            {cap('Шаблон')}
          </button>
        ) : null}

        {text ? (
          <button className="btn-tool" type="button" onClick={() => onCopyText(text)} title="Скопировать текст">
            <IconCopyText />
            {cap('Текст')}
          </button>
        ) : null}

        <button
          className="btn-tool"
          type="button"
          onClick={() => onLock(!locked)}
          aria-pressed={locked}
          title={locked ? 'Отпереть' : 'Запереть: не двигается и не стирается'}
        >
          {locked ? <IconLockClosed /> : <IconLockOpen />}
          {cap(locked ? 'Отпереть' : 'Запереть')}
        </button>

        {locked ? null : (
          <button className="btn-tool" type="button" onClick={onDelete} title="Удалить (Delete)">
            <IconTrash />
            {cap('Удалить')}
          </button>
        )}

        <button className="btn-tool" type="button" onClick={onDone} title="Готово — снять выделение">
          <IconCheck />
          {cap('Готово')}
        </button>
      </div>

      {naming ? (
        <div className="selection-panel__keep">
          <input
            className="input"
            type="text"
            autoFocus
            value={templateTitle}
            maxLength={80}
            placeholder="Название заготовки"
            onChange={(event) => setTemplateTitle(event.target.value)}
          />
          <div className="params__row">
            <button
              className="btn btn-sm"
              type="button"
              disabled={templateBusy || templateTitle.trim().length === 0}
              onClick={saveAsTemplate}
            >
              Сохранить
            </button>
            <button
              className="btn-quiet btn-sm"
              type="button"
              onClick={() => { setNaming(false); setTemplateNote(null); }}
            >
              Отмена
            </button>
          </div>
          {templateNote ? <p className="library__hint library__note">{templateNote}</p> : null}
        </div>
      ) : null}

      {items.length > 1 ? <span className="selection-panel__count">{items.length}</span> : null}
    </div>
  );
}
