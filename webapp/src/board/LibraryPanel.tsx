import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  FORMULAS, MATH_SYMBOLS, TEMPLATES, TEMPLATE_GROUPS, defaultParams,
} from './library';
import type { Template, TemplateGroup } from './library';
import { deleteTemplate, itemsOf, listTemplates, saveTemplate } from '../api/templates';
import type { TemplateItem, UserTemplate } from '../api/templates';
import { ApiError } from '../api/client';
import { IconTrash } from '../components/Icons';

type Tab = TemplateGroup | 'symbols' | 'formulas' | 'mine';

const TABS: { kind: Tab; title: string }[] = [
  ...TEMPLATE_GROUPS.map((group) => ({ kind: group.kind as Tab, title: group.title })),
  { kind: 'symbols', title: 'Знаки' },
  { kind: 'formulas', title: 'Формулы' },
  { kind: 'mine', title: 'Мои' },
];

interface Props {
  /** Заготовка собирается на стороне доски: только она знает вид и масштаб. */
  onInsert: (template: Template, params: Record<string, number>) => void;
  /** Своя заготовка приходит готовыми объектами — их только переносят к середине. */
  onInsertItems: (items: TemplateItem[]) => void;
  /** Знак или формула — обычная надпись посреди видимой части холста. */
  onText: (text: string) => void;
  /**
   * Что выделено на доске прямо сейчас — это и сохраняется в свою
   * заготовку. Картинки сюда не попадают: файл принадлежит своей доске.
   */
  selection: TemplateItem[];
  /** Гостю папка «Мои» закрыта: хранить заготовку было бы не за кем. */
  canKeep: boolean;
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
export function LibraryPanel({
  onInsert, onInsertItems, onText, selection, canKeep, onClose,
}: Props): ReactElement {
  const [tab, setTab] = useState<Tab>('axes');
  const [chosen, setChosen] = useState<string | null>(null);
  const [params, setParams] = useState(defaultParams);

  const [mine, setMine] = useState<UserTemplate[] | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const templates = TEMPLATES.filter((one) => one.group === tab);

  // Список тянем, только когда до него дошли: большинству занятий папка
  // «Мои» не нужна вовсе, и запрос при открытии доски был бы напрасным.
  useEffect(() => {
    if (tab !== 'mine' || !canKeep || mine !== null) return;

    let alive = true;

    listTemplates()
      .then((rows) => alive && setMine(rows))
      .catch((reason) => {
        if (!alive) return;
        setMine([]);
        setNote(reason instanceof ApiError ? reason.message : 'Не удалось прочитать заготовки.');
      });

    return () => {
      alive = false;
    };
  }, [tab, canKeep, mine]);

  const keep = () => {
    if (busy) return;

    setBusy(true);
    setNote(null);

    saveTemplate(title.trim(), selection)
      .then((saved) => {
        setMine((current) => [saved, ...(current ?? [])]);
        setTitle('');
      })
      .catch((reason) => setNote(reason instanceof ApiError ? reason.message : 'Не удалось сохранить.'))
      .finally(() => setBusy(false));
  };

  const drop = (template: UserTemplate) => {
    if (!window.confirm(`Удалить заготовку «${template.title}»?`)) return;

    deleteTemplate(template.id)
      .then(() => setMine((current) => (current ?? []).filter((one) => one.id !== template.id)))
      .catch((reason) => setNote(reason instanceof ApiError ? reason.message : 'Не удалось удалить.'));
  };

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
              setNote(null);
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

      {tab === 'mine' ? (
        <div className="library__list">
          {!canKeep ? (
            <p className="library__hint">
              Свои заготовки хранятся в учётной записи. Гостю на доске они недоступны.
            </p>
          ) : (
            <>
              <p className="library__hint">
                Выделите на доске готовый чертёж и сохраните его под именем — он встанет сюда и будет
                доступен на любой другой доске. Картинки в заготовку не попадают: файл остаётся у своей доски.
              </p>

              <div className="library__keep">
                <input
                  className="input"
                  type="text"
                  value={title}
                  maxLength={80}
                  placeholder="Название заготовки"
                  onChange={(event) => setTitle(event.target.value)}
                />
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy || title.trim().length === 0 || selection.length === 0}
                  onClick={keep}
                  title={selection.length === 0 ? 'Сначала выделите объекты на доске' : undefined}
                >
                  Сохранить выделенное ({selection.length})
                </button>
              </div>

              {note ? <p className="library__hint library__note">{note}</p> : null}

              {mine === null ? <p className="library__hint">Читаем…</p> : null}

              {mine !== null && mine.length === 0 ? (
                <p className="library__hint">Пока пусто.</p>
              ) : null}

              {(mine ?? []).map((one) => (
                <div className="library__mine" key={one.id}>
                  <button
                    className="btn-quiet library__pick"
                    type="button"
                    onClick={() => onInsertItems(itemsOf(one))}
                    title="Поставить на доску"
                  >
                    {one.title}
                    <span className="library__count">{one.count}</span>
                  </button>

                  <button
                    className="btn-quiet btn-sm"
                    type="button"
                    onClick={() => drop(one)}
                    aria-label={`Удалить заготовку ${one.title}`}
                    title="Удалить заготовку"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
