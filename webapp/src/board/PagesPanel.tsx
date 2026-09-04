import { useState } from 'react';
import type { ReactElement } from 'react';
import type { BoardPageInfo, PageVisibility, Participant } from './protocol';
import { IconArrowDown, IconArrowUp, IconCheck, IconEye, IconTrash } from '../components/Icons';

interface Props {
  pages: BoardPageInfo[];
  pageId: number | null;
  participants: Participant[];
  /** Ключ того, кто смотрит: себя в списке приглашённых отмечать незачем. */
  meKey: string | null;
  canManage: boolean;
  onOpen: (pageId: number) => void;
  onAdd: () => void;
  onRename: (pageId: number, title: string) => void;
  onDelete: (pageId: number) => void;
  onReorder: (order: number[]) => void;
  onVisibility: (pageId: number, visibility: PageVisibility, viewers: string[]) => void;
  onClose: () => void;
}

const VISIBILITY: { kind: PageVisibility; label: string; hint: string }[] = [
  { kind: 'all', label: 'Всем', hint: 'Страницу видит каждый, кто на доске.' },
  { kind: 'selected', label: 'Выбранным', hint: 'Страницу видите вы и отмеченные участники.' },
  { kind: 'owner', label: 'Только мне', hint: 'Страницу не видит никто, кроме вас.' },
];

/**
 * Страницы доски.
 *
 * Занятие идёт по страницам, и каждый ходит по ним сам: пока вы
 * разбираете задачу на своей, ученик решает на своей. Поэтому здесь
 * список, а не общая перелистывалка.
 *
 * Видимость настраивает владелец. Отмечать участников можно только тех,
 * кто на доске прямо сейчас: гостя вне занятия не существует — он придёт
 * по ссылке заново и будет уже другим.
 */
export function PagesPanel({
  pages, pageId, participants, meKey, canManage,
  onOpen, onAdd, onRename, onDelete, onReorder, onVisibility, onClose,
}: Props): ReactElement {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [tuning, setTuning] = useState<number | null>(null);

  const move = (index: number, delta: number) => {
    const order = pages.map((page) => page.id);
    const to = index + delta;
    if (to < 0 || to >= order.length) return;

    [order[index], order[to]] = [order[to], order[index]];
    onReorder(order);
  };

  return (
    <div className="params params--right" role="dialog" aria-label="Страницы">
      <div className="params__head">
        <span className="params__title">Страницы</span>
        <button className="btn-quiet btn-sm" type="button" onClick={onClose}>Готово</button>
      </div>

      <div className="pages">
        {pages.map((page, index) => (
          <div className={page.id === pageId ? 'pages__row pages__row--open' : 'pages__row'} key={page.id}>
            {editing === page.id ? (
              <input
                className="input pages__name"
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  if (draft.trim()) onRename(page.id, draft.trim());
                  setEditing(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                className="btn-quiet pages__name"
                type="button"
                onClick={() => onOpen(page.id)}
                onDoubleClick={() => {
                  if (!canManage) return;
                  setEditing(page.id);
                  setDraft(page.title);
                }}
              >
                {page.title}
                {page.visibility !== 'all' ? (
                  <span className="pages__mark">
                    {page.visibility === 'owner' ? 'только я' : 'выборочно'}
                  </span>
                ) : null}
              </button>
            )}

            {canManage ? (
              <span className="pages__tools">
                {/* Значки, а не знаки: стрелка и шестерёнка из шрифта
                    стояли в одном ряду с рисованной корзиной и заметно
                    отличались от неё и толщиной, и размером. */}
                <button
                  className="btn-tool btn-tool--tiny" type="button" title="Выше" aria-label="Выше"
                  disabled={index === 0} onClick={() => move(index, -1)}
                >
                  <IconArrowUp size={14} />
                </button>
                <button
                  className="btn-tool btn-tool--tiny" type="button" title="Ниже" aria-label="Ниже"
                  disabled={index === pages.length - 1} onClick={() => move(index, 1)}
                >
                  <IconArrowDown size={14} />
                </button>
                <button
                  className="btn-tool btn-tool--tiny" type="button" title="Кому видна"
                  aria-label="Кому видна" aria-pressed={tuning === page.id}
                  onClick={() => setTuning(tuning === page.id ? null : page.id)}
                >
                  <IconEye size={14} />
                </button>
                <button
                  className="btn-tool btn-tool--tiny" type="button" title="Удалить страницу"
                  disabled={pages.length <= 1}
                  onClick={() => {
                    if (window.confirm(`Удалить «${page.title}» вместе со всем, что на ней?`)) {
                      onDelete(page.id);
                    }
                  }}
                >
                  <IconTrash size={14} />
                </button>
              </span>
            ) : null}

            {canManage && tuning === page.id ? (
              <div className="pages__access">
                <div className="row">
                  {VISIBILITY.map((option) => (
                    <button
                      key={option.kind}
                      className={page.visibility === option.kind ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}
                      type="button"
                      onClick={() => onVisibility(page.id, option.kind, page.viewers ?? [])}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <p className="text-muted small" style={{ margin: 'var(--sp-2) 0 0' }}>
                  {VISIBILITY.find((option) => option.kind === page.visibility)?.hint}
                </p>

                {page.visibility === 'selected' ? (
                  <>
                    {participants.filter((one) => one.key !== meKey).map((one) => {
                      const chosen = (page.viewers ?? []).includes(one.key);

                      return (
                        <div className="check" key={one.connectionId}>
                          <input
                            id={`p${page.id}-${one.connectionId}`}
                            type="checkbox"
                            checked={chosen}
                            onChange={() => onVisibility(
                              page.id,
                              'selected',
                              chosen
                                ? (page.viewers ?? []).filter((key) => key !== one.key)
                                : [...(page.viewers ?? []), one.key],
                            )}
                          />
                          <label htmlFor={`p${page.id}-${one.connectionId}`}>
                            {one.displayName}{one.isGuest ? ' (гость)' : ''}
                          </label>
                        </div>
                      );
                    })}

                    {participants.filter((one) => one.key !== meKey).length === 0 ? (
                      <p className="text-muted small" style={{ margin: 'var(--sp-2) 0 0' }}>
                        Отмечать некого: на доске пока никого нет. Пригласите — и вернитесь сюда.
                      </p>
                    ) : (
                      <p className="text-muted small" style={{ margin: 'var(--sp-2) 0 0' }}>
                        Гость держится в списке, пока идёт занятие: придя по ссылке заново, он
                        станет другим участником, и отметку придётся поставить снова.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}

            {page.id === pageId ? <IconCheck size={16} /> : null}
          </div>
        ))}
      </div>

      {canManage ? (
        <button className="btn btn-quiet btn-sm" type="button" onClick={onAdd}>
          Добавить страницу
        </button>
      ) : null}

      {pages.length === 0 ? (
        <p className="text-muted small">Вам пока не открыта ни одна страница этой доски.</p>
      ) : null}
    </div>
  );
}
