import type { ReactElement } from 'react';
import type { Background, GridStyle } from './protocol';

const COLORS = ['#FFFDF8', '#FFFFFF', '#F4F1E8', '#EAF2F8', '#EAF6EE', '#2A211C'];

const GRIDS: { kind: GridStyle; label: string }[] = [
  { kind: 'none', label: 'Без сетки' },
  { kind: 'line', label: 'Линия' },
  { kind: 'dot', label: 'Точка' },
  { kind: 'square', label: 'Клетка' },
  { kind: 'graph', label: 'График' },
  { kind: 'rhombus', label: 'Ромб' },
];

const GRID_COLORS = ['#D9CFC0', '#C7D6E5', '#CFE0D2', '#E0CFCF', '#5A4A3E'];

interface Props {
  value: Background;
  onChange: (value: Background) => void;
  onClose: () => void;
}

/**
 * Оформление холста.
 *
 * Меняет только владелец, и меняется оно у всех сразу: фон — свойство
 * доски, а не настройка каждого. Иначе один объяснял бы по клетке,
 * а другой смотрел бы на чистый лист.
 */
export function BackgroundPanel({ value, onChange, onClose }: Props): ReactElement {
  return (
    <div className="params params--right" role="dialog" aria-label="Оформление фона">
      <div className="params__head">
        <span className="params__title">Фон доски</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      <p className="params__label">Цвет</p>
      <div className="params__row">
        {COLORS.map((color) => (
          <button
            key={color}
            className="swatch"
            type="button"
            aria-pressed={value.background === color}
            aria-label={`Фон ${color}`}
            style={{ background: color }}
            onClick={() => onChange({ ...value, background: color })}
          />
        ))}
      </div>

      <p className="params__label">Разлиновка</p>
      <div className="params__row">
        {GRIDS.map((grid) => (
          <button
            key={grid.kind}
            className="btn-quiet btn-sm"
            type="button"
            aria-pressed={value.gridStyle === grid.kind}
            onClick={() => onChange({ ...value, gridStyle: grid.kind })}
          >
            {grid.label}
          </button>
        ))}
      </div>

      <p className="params__label">Цвет разлиновки</p>
      <div className="params__row">
        {GRID_COLORS.map((color) => (
          <button
            key={color}
            className="swatch"
            type="button"
            aria-pressed={value.gridColor === color}
            aria-label={`Разлиновка ${color}`}
            style={{ background: color }}
            onClick={() => onChange({ ...value, gridColor: color })}
          />
        ))}
      </div>
    </div>
  );
}
