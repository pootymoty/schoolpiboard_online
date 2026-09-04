import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  FORMULAS, MATH_SYMBOLS, TEMPLATES, TEMPLATE_GROUPS, defaultParams,
} from './library';
import type { Template, TemplateGroup } from './library';

type Tab = TemplateGroup | 'symbols' | 'formulas';

const TABS: { kind: Tab; title: string }[] = [
  ...TEMPLATE_GROUPS.map((group) => ({ kind: group.kind as Tab, title: group.title })),
  { kind: 'symbols', title: 'Знаки' },
  { kind: 'formulas', title: 'Формулы' },
];

interface Props {
  /** Заготовка собирается на стороне доски: только она знает вид и масштаб. */
  onInsert: (template: Template, params: Record<string, number>) => void;
  /** Знак или формула — обычная надпись посреди видимой части холста. */
  onText: (text: string) => void;
  onClose: () => void;
}

/**
 * Библиотека заготовок.
 *
 * Чертёж, который на доске рисуют каждый раз заново — оси, призму, шар, —
 * здесь ставится одной кнопкой и настраивается до вставки: после неё это
 * обычные линии, и правят их обычными инструментами.
 *
 * Настройки живут в панели, а не в объекте: пересобрать вставленное по
 * новому числу граней означало бы стереть всё, что на нём уже подписали.
 */
export function LibraryPanel({ onInsert, onText, onClose }: Props): ReactElement {
  const [tab, setTab] = useState<Tab>('axes');
  const [chosen, setChosen] = useState<string | null>(null);
  const [params, setParams] = useState(defaultParams);

  const templates = TEMPLATES.filter((one) => one.group === tab);

  const tune = (id: string, key: string, value: number) => {
    setParams((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  };

  const knobsOf = (template: Template): ReactElement => (
    <div className="library__knobs">
      {template.knobs.map((knob) => {
        const value = params[template.id][knob.key];

        if (knob.kind === 'toggle') {
          return (
            <label key={knob.key} className="library__toggle">
              <input
                type="checkbox"
                checked={value > 0}
                onChange={(event) => tune(template.id, knob.key, event.target.checked ? 1 : 0)}
              />
              {knob.label}
            </label>
          );
        }

        return (
          <label key={knob.key} className="library__knob">
            <span className="library__knob-name">
              {knob.label}
              <b>{value}{knob.suffix ? ` ${knob.suffix}` : ''}</b>
            </span>
            <input
              type="range"
              min={knob.min}
              max={knob.max}
              step={1}
              value={value}
              onChange={(event) => tune(template.id, knob.key, Number(event.target.value))}
            />
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="params params--right params--tall" role="dialog" aria-label="Заготовки">
      <div className="params__head">
        <span className="params__title">Заготовки</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      <div className="params__row library__tabs">
        {TABS.map((one) => (
          <button
            key={one.kind}
            className="btn-quiet btn-sm"
            type="button"
            aria-pressed={tab === one.kind}
            onClick={() => {
              setTab(one.kind);
              setChosen(null);
            }}
          >
            {one.title}
          </button>
        ))}
      </div>

      {templates.length > 0 ? (
        <div className="library__list">
          {templates.map((template) => (
            <div className="library__item" key={template.id}>
              <button
                className="btn-quiet library__pick"
                type="button"
                aria-pressed={chosen === template.id}
                onClick={() => setChosen(chosen === template.id ? null : template.id)}
              >
                {template.title}
              </button>

              {chosen === template.id ? (
                <>
                  <p className="library__hint">{template.hint}</p>
                  {knobsOf(template)}
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => onInsert(template, params[template.id])}
                  >
                    Вставить
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'symbols' ? (
        <div className="library__list">
          <p className="library__hint">
            Знак встаёт надписью посреди видимой части доски — дальше его двигают и правят как обычный текст.
          </p>

          {MATH_SYMBOLS.map((row) => (
            <div key={row.title}>
              <p className="params__label">{row.title}</p>
              <div className="params__row library__glyphs">
                {row.items.map((glyph, index) => (
                  <button
                    key={`${row.title}-${index}`}
                    className="btn-quiet library__glyph"
                    type="button"
                    onClick={() => onText(glyph)}
                    title={`Вставить ${glyph}`}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'formulas' ? (
        <div className="library__list">
          {FORMULAS.map((row) => (
            <div key={row.title}>
              <p className="params__label">{row.title}</p>
              {row.items.map((one) => (
                <button
                  key={one.label}
                  className="btn-quiet library__formula"
                  type="button"
                  onClick={() => onText(one.text)}
                >
                  <span className="library__formula-name">{one.label}</span>
                  <span className="library__formula-text">{one.text}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
