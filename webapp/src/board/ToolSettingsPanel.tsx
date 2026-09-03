import type { ReactElement } from 'react';
import {
  ERASER_SIZES, LINE_STYLES, OPACITIES, PALETTE, SHAPES, SIZES,
} from './tools';
import type { PenSettings, ShapeSettings, Tool, ToolSettings } from './tools';
import { LineStyleIcon, ShapeIcon } from './ShapeIcons';

interface Props {
  tool: Tool;
  settings: ToolSettings;
  onChange: (settings: ToolSettings) => void;
  onClose: () => void;
}

/**
 * Параметры активного инструмента.
 *
 * Панель одна на все инструменты: у пера и маркера набор одинаковый,
 * у фигур к нему добавляются вид и тип линии, у ластика остаётся только
 * размер. Разводить это по трём похожим панелям значило бы трижды
 * повторить одно и то же.
 */
export function ToolSettingsPanel({ tool, settings, onChange, onClose }: Props): ReactElement | null {
  if (tool === 'select' || tool === 'hand') return null;

  const pen = (tool === 'pen1' || tool === 'pen2' || tool === 'marker') ? settings[tool] : null;
  const patchPen = (patch: Partial<PenSettings>) => {
    if (!pen) return;
    onChange({ ...settings, [tool]: { ...pen, ...patch } });
  };

  const shapes = tool === 'shapes' ? settings.shapes : null;
  const patchShape = (patch: Partial<ShapeSettings>) => {
    onChange({ ...settings, shapes: { ...settings.shapes, ...patch } });
  };

  const swatches = (current: string, apply: (color: string) => void) => (
    <div className="params__row">
      {PALETTE.map((value) => (
        <button
          key={value}
          className="swatch"
          type="button"
          aria-pressed={current === value}
          aria-label={`Цвет ${value}`}
          style={{ background: value }}
          onClick={() => apply(value)}
        />
      ))}

      {/* Произвольный цвет: палитра закрывает обычные случаи, но
          «тот самый зелёный из учебника» в ней не окажется никогда.
          Берём готовое окно браузера — своё было бы хуже и тяжелее. */}
      <label className="swatch swatch--custom" title="Свой цвет">
        <input
          type="color"
          value={current}
          onChange={(event) => apply(event.target.value)}
          aria-label="Свой цвет"
        />
      </label>
    </div>
  );

  return (
    <div className="params" role="dialog" aria-label="Параметры инструмента">
      <div className="params__head">
        <span className="params__title">{titleOf(tool)}</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      {pen ? (
        <>
          <p className="params__label">Размер</p>
          <div className="params__row">
            {SIZES.map((value) => (
              <button
                key={value}
                className="btn-tool"
                type="button"
                aria-pressed={pen.width === value}
                aria-label={`Размер ${value}`}
                onClick={() => patchPen({ width: value })}
              >
                <span
                  className="width-dot"
                  style={{ width: Math.min(24, value), height: Math.min(24, value) }}
                />
              </button>
            ))}
          </div>

          <p className="params__label">Прозрачность</p>
          <div className="params__row">
            {OPACITIES.map((value) => (
              <button
                key={value}
                className="btn-quiet btn-sm"
                type="button"
                aria-pressed={pen.opacity === value}
                onClick={() => patchPen({ opacity: value })}
              >
                {value} %
              </button>
            ))}
          </div>

          {/* Живой предпросмотр: подобрать толщину на глаз проще, чем по числу. */}
          <div className="params__preview">
            <span
              style={{
                background: pen.color,
                opacity: pen.opacity / 100,
                height: Math.max(1, Math.min(30, pen.width)),
              }}
            />
          </div>

          <p className="params__label">Цвет</p>
          {swatches(pen.color, (color) => patchPen({ color }))}
        </>
      ) : null}

      {shapes ? (
        <>
          <p className="params__label">Фигура</p>
          <div className="params__row">
            {SHAPES.map((item) => (
              <button
                key={item.kind}
                className="btn-tool"
                type="button"
                aria-pressed={shapes.shape === item.kind}
                aria-label={item.label}
                title={item.label}
                onClick={() => patchShape({ shape: item.kind })}
              >
                <ShapeIcon kind={item.kind} />
              </button>
            ))}
          </div>

          <p className="params__label">Толщина</p>
          <div className="params__row">
            {SIZES.map((value) => (
              <button
                key={value}
                className="btn-tool"
                type="button"
                aria-pressed={shapes.width === value}
                aria-label={`Толщина ${value}`}
                onClick={() => patchShape({ width: value })}
              >
                <span
                  className="width-dot"
                  style={{ width: Math.min(24, value), height: Math.min(24, value) }}
                />
              </button>
            ))}
          </div>

          <p className="params__label">Тип линии</p>
          <div className="params__row">
            {LINE_STYLES.map((item) => (
              <button
                key={item.kind}
                className="btn-tool btn-tool--line"
                type="button"
                aria-pressed={shapes.lineStyle === item.kind}
                aria-label={item.label}
                title={item.label}
                onClick={() => patchShape({ lineStyle: item.kind })}
              >
                <LineStyleIcon kind={item.kind} />
              </button>
            ))}
          </div>

          <p className="params__label">Цвет контура</p>
          {swatches(shapes.color, (color) => patchShape({ color }))}

          <p className="params__label">Заливка</p>
          <div className="params__row">
            {/* «Без заливки» — первым: у фигуры на доске это обычное
                состояние, а заливка нужна, когда что-то выделяют. */}
            <button
              className="btn-quiet btn-sm"
              type="button"
              aria-pressed={shapes.fill === ''}
              onClick={() => patchShape({ fill: '' })}
            >
              Нет
            </button>

            {PALETTE.map((value) => (
              <button
                key={value}
                className="swatch"
                type="button"
                aria-pressed={shapes.fill === value}
                aria-label={`Заливка ${value}`}
                style={{ background: value }}
                onClick={() => patchShape({ fill: value })}
              />
            ))}

            <label className="swatch swatch--custom" title="Свой цвет заливки">
              <input
                type="color"
                value={shapes.fill || '#ffffff'}
                onChange={(event) => patchShape({ fill: event.target.value })}
                aria-label="Свой цвет заливки"
              />
            </label>
          </div>
        </>
      ) : null}

      {tool === 'eraser' ? (
        <>
          <p className="params__label">Размер</p>
          <div className="params__row">
            {ERASER_SIZES.map((value) => (
              <button
                key={value}
                className="btn-quiet btn-sm"
                type="button"
                aria-pressed={settings.eraser.size === value}
                onClick={() => onChange({ ...settings, eraser: { size: value } })}
              >
                {value}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {tool === 'text' ? (
        <>
          <p className="params__label">Размер шрифта</p>
          <div className="params__row">
            {[16, 20, 24, 32, 48, 64].map((value) => (
              <button
                key={value}
                className="btn-quiet btn-sm"
                type="button"
                aria-pressed={settings.text.fontSize === value}
                onClick={() => onChange({ ...settings, text: { ...settings.text, fontSize: value } })}
              >
                {value}
              </button>
            ))}
          </div>

          <p className="params__label">Цвет</p>
          {swatches(settings.text.color, (color) => (
            onChange({ ...settings, text: { ...settings.text, color } })
          ))}
        </>
      ) : null}

      {tool === 'table' ? (
        <>
          <p className="params__label">Строк</p>
          <div className="params__row">
            {[2, 3, 4, 5, 6, 8, 10].map((value) => (
              <button
                key={value}
                className="btn-quiet btn-sm"
                type="button"
                aria-pressed={settings.table.rows === value}
                onClick={() => onChange({ ...settings, table: { ...settings.table, rows: value } })}
              >
                {value}
              </button>
            ))}
          </div>

          <p className="params__label">Столбцов</p>
          <div className="params__row">
            {[2, 3, 4, 5, 6, 8].map((value) => (
              <button
                key={value}
                className="btn-quiet btn-sm"
                type="button"
                aria-pressed={settings.table.cols === value}
                onClick={() => onChange({ ...settings, table: { ...settings.table, cols: value } })}
              >
                {value}
              </button>
            ))}
          </div>

          <p className="params__label">Размер шрифта</p>
          <div className="params__row">
            {[14, 16, 20, 24, 32].map((value) => (
              <button
                key={value}
                className="btn-quiet btn-sm"
                type="button"
                aria-pressed={settings.table.fontSize === value}
                onClick={() => onChange({ ...settings, table: { ...settings.table, fontSize: value } })}
              >
                {value}
              </button>
            ))}
          </div>

          <p className="params__label">Цвет</p>
          {swatches(settings.table.color, (color) => (
            onChange({ ...settings, table: { ...settings.table, color } })
          ))}

          <p className="text-muted small" style={{ margin: 'var(--sp-2) 0 0' }}>
            Растяните рамку на доске. Чтобы заполнить ячейку — выберите таблицу
            и нажмите на ячейку ещё раз.
          </p>
        </>
      ) : null}
    </div>
  );
}

function titleOf(tool: Tool): string {
  if (tool === 'pen1') return 'Перо 1';
  if (tool === 'pen2') return 'Перо 2';
  if (tool === 'marker') return 'Маркер';
  if (tool === 'eraser') return 'Ластик';
  if (tool === 'text') return 'Текст';
  if (tool === 'table') return 'Таблица';
  return 'Фигуры';
}
