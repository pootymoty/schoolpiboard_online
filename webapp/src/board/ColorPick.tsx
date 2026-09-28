import { useState } from 'react';
import type { ReactElement } from 'react';
import { PALETTE } from './tools';
import { IconCheck } from '../components/Icons';

/** Кружок «цвета разные» — у группы разноцветного выделенного. */
const MIXED = 'conic-gradient(#C62828, #FFB300, #2E7D32, #1565C0, #6A1B9A, #C62828)';

interface Props {
  label: string;
  /** Текущий цвет; `''` — «нет» (заливки), `undefined` — у выделенного разные. */
  value: string | undefined;
  onChange: (color: string) => void;
  /** Добавить в конец палитры вариант «Нет» — для заливки. */
  none?: boolean;
  /**
   * Свой цвет применять по закрытию окна выбора, а не на каждый оттенок:
   * у объекта на доске каждое изменение — правка на сервере, а браузер
   * сообщает о каждом оттенке, пока цвет тянут по кругу.
   */
  commitOnClose?: boolean;
  /** Мелкие кружки — в тесной панели выделенного. */
  small?: boolean;
}

/**
 * Выбор цвета, свёрнутый в строку: подпись и кружок текущего цвета, по
 * нажатию под ней раскрывается палитра. Развёрнутые сразу цвет и заливка —
 * это три десятка кружков, и остальные настройки уезжали из виду.
 *
 * Выбранный вариант отмечен галочкой — и цвет из палитры, и свой, и «Нет».
 */
export function ColorPick({ label, value, onChange, none, commitOnClose, small }: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(value && !PALETTE.includes(value) ? value : '#2A211C');

  const size = small ? ' swatch--sm' : '';
  const own = value !== undefined && value !== '' && !PALETTE.includes(value);
  const check = <span className="swatch__check"><IconCheck size={small ? 12 : 14} /></span>;

  return (
    <div className="color-pick">
      <button
        className="color-pick__head"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="color-pick__label">{label}</span>
        <span
          className={value === '' ? `swatch${size} swatch--none` : `swatch${size}`}
          style={value === '' ? undefined : { background: value ?? MIXED }}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className={small ? 'color-pick__grid color-pick__grid--sm' : 'color-pick__grid'}>
          {PALETTE.map((color) => (
            <button
              key={color}
              className={`swatch${size}`}
              type="button"
              aria-pressed={value === color}
              aria-label={`Цвет ${color}`}
              style={{ background: color }}
              onClick={() => onChange(color)}
            >
              {value === color ? check : null}
            </button>
          ))}

          {/* Свой цвет: палитра закрывает обычные случаи, но «тот самый
              зелёный из учебника» в ней не окажется никогда. Пока выбран
              свой, кружок показывает его, а не радужную заглушку. */}
          <label
            className={`swatch${size} swatch--custom`}
            title="Свой цвет"
            style={own ? { background: value } : undefined}
          >
            <input
              type="color"
              value={own ? value : custom}
              onChange={(event) => {
                setCustom(event.target.value);
                if (!commitOnClose) onChange(event.target.value);
              }}
              onBlur={commitOnClose ? () => onChange(custom) : undefined}
              aria-label="Свой цвет"
            />
            {own ? check : null}
          </label>

          {/* «Нет» — последним: обычный выбор — цвет, отказ от него реже. */}
          {none ? (
            <button
              className={`swatch${size} swatch--none`}
              type="button"
              aria-pressed={value === ''}
              aria-label="Нет"
              title="Нет"
              onClick={() => onChange('')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
