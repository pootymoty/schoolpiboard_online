import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  adminSurveys, closeSurvey, createSurvey, deleteSurveyTemplate, saveSurveyTemplate, surveyResults,
  surveyTemplate, surveyTemplates, textAnswers, typeOf,
} from '../api/surveys';
import type {
  AdminSurvey, SurveyQuestion, SurveyQuestionDraft, SurveyQuestionResult, SurveyResults, SurveyTemplate,
} from '../api/surveys';
import { useAuth } from '../auth/AuthContext';
import { IconTrash } from '../components/Icons';
import { Page } from '../components/Layout';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';

/** Опросов на странице. */
const SIZE = 10;

/**
 * Где лежит неотправленная форма. Закрыл редактор, не отправив, — при
 * следующем открытии форма такая же, как была; отправил — с чего начинать
 * дальше, решает сервер (вопросы последнего опроса).
 */
const DRAFT_KEY = 'schoolpiboard.admin.surveyDraft';

/** Вопрос в редакторе: свой ключ — только для React, на сервер не уходит. */
interface EditorQuestion extends SurveyQuestionDraft {
  uid: number;
}

let nextUid = 1;

const blank = (): EditorQuestion => ({ uid: nextUid++, text: '', type: 'scale', optional: false });

const fromQuestions = (questions: Array<SurveyQuestion | SurveyQuestionDraft>): EditorQuestion[] =>
  questions.map((question) => ({
    uid: nextUid++,
    text: question.text,
    type: typeOf(question),
    optional: question.optional,
  }));

const toDrafts = (questions: EditorQuestion[]): SurveyQuestionDraft[] =>
  questions.map(({ text, type, optional }) => ({ text: text.trim(), type, optional: type === 'text' || optional }));

function readDraft(): EditorQuestion[] | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) as SurveyQuestionDraft[] : null;
    return Array.isArray(parsed) && parsed.length > 0 ? fromQuestions(parsed) : null;
  } catch {
    return null;
  }
}

function writeDraft(questions: EditorQuestion[] | null): void {
  try {
    if (questions) localStorage.setItem(DRAFT_KEY, JSON.stringify(toDrafts(questions)));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Без хранилища (приватный режим) форма просто не переживёт закрытие.
  }
}

function dayTime(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const questionsWord = (count: number): string => {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return 'вопросов';
  if (ones === 1) return 'вопрос';
  if (ones >= 2 && ones <= 4) return 'вопроса';
  return 'вопросов';
};

/**
 * Опросы пользователей: составить и отправить новый, посмотреть
 * результаты прошлых.
 *
 * Каждая отправка — отдельный опрос со своими ответами. Строки по
 * умолчанию свёрнуты: результаты нужны по одному, а не все сразу.
 */
export function AdminSurveysPage(): ReactElement {
  const { user, loading } = useAuth();

  const [items, setItems] = useState<AdminSurvey[]>([]);
  const [total, setTotal] = useState(0);
  const [recipients, setRecipients] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [open, setOpen] = useState<number | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);

  /** Редактор нового опроса; пусто — закрыт. */
  const [editing, setEditing] = useState<EditorQuestion[] | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);

  const load = useCallback((at: number) => {
    adminSurveys(at)
      .then((answer) => {
        setItems(answer.items);
        setTotal(answer.total);
        setRecipients(answer.recipientsNow);
      })
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить опросы.'));
  }, []);

  useEffect(() => {
    if (user?.isAdmin) load(page);
  }, [user?.isAdmin, page, load]);

  // Пока письма уходят, счётчик «отправлено» растёт — обновляем список сами.
  const sending = items.some((one) => one.sent < one.recipients && !one.closedAt);
  useEffect(() => {
    if (!sending) return undefined;
    const timer = window.setInterval(() => load(page), 5000);
    return () => window.clearInterval(timer);
  }, [sending, page, load]);

  const startEditing = async () => {
    setError(null);
    setNote(null);

    const draft = readDraft();
    if (draft) {
      setEditing(draft);
    } else {
      try {
        const template = await surveyTemplate();
        setEditing(fromQuestions(template.questions));
      } catch (reason) {
        setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть форму опроса.');
        return;
      }
    }

    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const sent = (count: number) => {
    writeDraft(null);
    setEditing(null);
    setNote(`Опрос создан, письма уходят ${count} пользователям — по одному, это займёт пару минут.`);
    setPage(1);
    load(1);
  };

  const toggle = (id: number) => {
    if (open === id) {
      setOpen(null);
      return;
    }

    setOpen(id);
    setResults(null);
    surveyResults(id)
      .then(setResults)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить результаты.'));
  };

  const close = async (id: number) => {
    if (!window.confirm('Закрыть опрос? Новые ответы на него приниматься не будут.')) return;

    try {
      await closeSurvey(id);
      load(page);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось закрыть опрос.');
    }
  };

  if (loading) return <Page narrow>{null}</Page>;
  if (!user?.isAdmin) return <Navigate to="/boards" replace />;

  const pages = Math.max(1, Math.ceil(total / SIZE));

  return (
    <Page>
      <div className="page-header">
        <div>
          <p className="page-header__sub"><Link to="/admin">← Администрирование</Link></p>
          <h1>Опросы</h1>
        </div>
        {editing ? null : (
          <div className="page-header__actions">
            <button className="btn-primary" type="button" onClick={() => void startEditing()}>
              Создать опрос
            </button>
          </div>
        )}
      </div>

      {note ? <p className="note note-success">{note}</p> : null}
      {error ? <p className="note note-danger">{error}</p> : null}

      {editing ? (
        <section className="card survey-editor__card" ref={editorRef}>
          <SurveyEditor
            questions={editing}
            recipients={recipients}
            onChange={(next) => {
              setEditing(next);
              writeDraft(next);
            }}
            onCancel={() => setEditing(null)}
            onSent={sent}
          />
        </section>
      ) : null}

      <section className="card">
        <h2 className="card-title">Результаты{total > 0 ? ` · ${total}` : ''}</h2>

        {items.length === 0 ? (
          <p className="text-muted">Опросов ещё не было.</p>
        ) : (
          // Списком, а не таблицей: раскрытые результаты занимают всю
          // ширину, а на телефоне строка просто переносится, не раздвигая
          // страницу и не уезжая в горизонтальную прокрутку.
          <ul className="survey-list">
            {items.map((one) => (
              <li className="survey-list__item" key={one.id}>
                <div className="survey-list__row">
                  <div className="survey-list__info">
                    <strong>Опрос №{one.id}</strong>
                    <span className="text-muted small">{dayTime(one.createdAt)}</span>
                    <span className="survey-list__meta">
                      <span>писем {one.sent} из {one.recipients}</span>
                      <span>ответов {one.responses}</span>
                      <span>{one.closedAt ? `закрыт ${dayTime(one.closedAt)}` : 'идёт'}</span>
                    </span>
                  </div>

                  <div className="admin__actions">
                    <button className="btn-quiet btn-sm" type="button" onClick={() => toggle(one.id)}
                            aria-expanded={open === one.id}>
                      {open === one.id ? 'Свернуть' : 'Результаты'}
                    </button>
                    {one.closedAt ? null : (
                      <button className="btn-quiet btn-sm" type="button" onClick={() => void close(one.id)}>
                        Закрыть
                      </button>
                    )}
                  </div>
                </div>

                {open === one.id ? (
                  <div className="survey-list__open">
                    {results?.id === one.id
                      ? <Results results={results} />
                      : <p className="text-muted">Загружаем…</p>}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? <Pagination page={page} count={pages} onPage={setPage} label="Страницы списка опросов" /> : null}
      </section>
    </Page>
  );
}

/**
 * Составление опроса: вопросы-оценки и открытые вопросы, «Добавить вопрос»
 * под каждым, корзина у каждого. Сверху — готовый шаблон, внизу — сохранить
 * шаблоном или отправить.
 */
function SurveyEditor({ questions, recipients, onChange, onCancel, onSent }: {
  questions: EditorQuestion[];
  recipients: number;
  onChange: (questions: EditorQuestion[]) => void;
  onCancel: () => void;
  onSent: (recipients: number) => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Имя последнего выбранного или сохранённого шаблона — подставляется при сохранении. */
  const [templateName, setTemplateName] = useState('');

  const update = (uid: number, patch: Partial<EditorQuestion>) => {
    onChange(questions.map((question) => (question.uid === uid ? { ...question, ...patch } : question)));
  };

  const insertAfter = (index: number) => {
    const next = [...questions];
    next.splice(index + 1, 0, blank());
    onChange(next);
  };

  const remove = (uid: number) => onChange(questions.filter((question) => question.uid !== uid));

  /** Что не так с формой; пусто — можно отправлять и сохранять. */
  const problem = (): string | null => {
    if (questions.length === 0) return 'Добавьте хотя бы один вопрос.';
    const empty = questions.findIndex((question) => !question.text.trim());
    if (empty >= 0) return `Впишите текст вопроса ${empty + 1}.`;
    return null;
  };

  const askToSend = () => {
    const wrong = problem();
    setError(wrong);
    setNote(null);
    if (!wrong) setConfirming(true);
  };

  const send = async () => {
    setBusy(true);
    setError(null);

    try {
      const answer = await createSurvey(toDrafts(questions));
      setConfirming(false);
      onSent(answer.recipients);
    } catch (reason) {
      setConfirming(false);
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отправить опрос.');
    } finally {
      setBusy(false);
    }
  };

  const askToSave = () => {
    const wrong = problem();
    setError(wrong);
    setNote(null);
    if (!wrong) setSaving(true);
  };

  return (
    <>
      <div className="survey-editor__head">
        <h2 className="card-title">Новый опрос</h2>
        <button className="btn-outline btn-sm" type="button" onClick={() => setPicking(true)}>
          Выбрать готовый шаблон
        </button>
      </div>

      <p className="text-muted small">
        Оценка — шкала от 1 до 10, где 1 — плохо, 10 — отлично. Открытый ответ — поле для текста, его
        можно оставить пустым. Форма запоминается: закроете, не отправив, — при следующем открытии она
        будет такой же.
      </p>

      {questions.length === 0 ? (
        <button className="btn-quiet btn-sm" type="button" onClick={() => insertAfter(-1)}>+ Добавить вопрос</button>
      ) : null}

      <ol className="survey-editor">
        {questions.map((question, index) => (
          <li className="survey-editor__item" key={question.uid}>
            <div className="survey-editor__question">
              <span className="survey-editor__number">{index + 1}</span>

              <div className="survey-editor__fields">
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="Текст вопроса"
                  aria-label={`Текст вопроса ${index + 1}`}
                  value={question.text}
                  onChange={(event) => update(question.uid, { text: event.target.value })}
                />

                <div className="survey-editor__options">
                  <select
                    aria-label={`Тип ответа на вопрос ${index + 1}`}
                    value={question.type}
                    onChange={(event) => update(question.uid, { type: event.target.value as EditorQuestion['type'] })}
                  >
                    <option value="scale">Оценка от 1 до 10</option>
                    <option value="text">Открытый ответ</option>
                  </select>

                  {question.type === 'scale' ? (
                    <label className="survey__skip">
                      <input
                        type="checkbox"
                        checked={question.optional}
                        onChange={(event) => update(question.uid, { optional: event.target.checked })}
                      />
                      Можно ответить «Не пользовался»
                    </label>
                  ) : null}
                </div>
              </div>

              <button
                className="btn-tool survey-editor__remove"
                type="button"
                onClick={() => remove(question.uid)}
                aria-label={`Удалить вопрос ${index + 1}`}
                title="Удалить вопрос"
                data-tip="Удалить вопрос"
              >
                <IconTrash />
              </button>
            </div>

            <button className="btn-quiet btn-sm survey-editor__add" type="button" onClick={() => insertAfter(index)}>
              + Добавить вопрос
            </button>
          </li>
        ))}
      </ol>

      {error ? <p className="note note-danger">{error}</p> : null}
      {note ? <p className="note note-success">{note}</p> : null}

      <div className="survey-editor__actions">
        <button className="btn-primary" type="button" onClick={askToSend} disabled={busy}>Отправить опрос</button>
        <button className="btn-outline" type="button" onClick={askToSave} disabled={busy}>Сохранить шаблон</button>
        <button className="btn-quiet" type="button" onClick={onCancel} disabled={busy}>Отмена</button>
      </div>

      {confirming ? (
        <Modal title="Отправить опрос?" onClose={() => setConfirming(false)}>
          <p>
            Письмо со ссылкой на опрос ({questions.length} {questionsWord(questions.length)}) получат
            {' '}<b>{recipients}</b> пользователей — все, у кого подтверждена почта. Отменить отправку будет нельзя.
          </p>
          <div className="row">
            <button className="btn-primary" type="button" onClick={() => void send()} disabled={busy || recipients === 0}>
              {busy ? 'Отправляем…' : 'Отправить'}
            </button>
            <button className="btn-quiet" type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Отмена
            </button>
          </div>
        </Modal>
      ) : null}

      {saving ? (
        <SaveTemplate
          initial={templateName}
          questions={questions}
          onClose={() => setSaving(false)}
          onSaved={(name, message) => {
            setTemplateName(name);
            setSaving(false);
            setNote(message);
          }}
        />
      ) : null}

      {picking ? (
        <PickTemplate
          onClose={() => setPicking(false)}
          onPick={(template) => {
            onChange(fromQuestions(template.questions));
            setTemplateName(template.name);
            setPicking(false);
            setError(null);
            setNote(`Вопросы взяты из шаблона «${template.name}».`);
          }}
        />
      ) : null}
    </>
  );
}

function SaveTemplate({ initial, questions, onClose, onSaved }: {
  initial: string;
  questions: EditorQuestion[];
  onClose: () => void;
  onSaved: (name: string, message: string) => void;
}): ReactElement {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);

    try {
      const answer = await saveSurveyTemplate(name.trim(), toDrafts(questions));
      onSaved(name.trim(), answer.message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить шаблон.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Сохранить шаблон" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="field">
          <label htmlFor="templateName">Название шаблона</label>
          <input id="templateName" type="text" maxLength={100} required autoFocus
                 value={name} onChange={(event) => setName(event.target.value)} />
          <p className="text-muted small">Шаблон с тем же названием будет заменён этими вопросами.</p>
        </div>

        {error ? <p className="note note-danger">{error}</p> : null}

        <div className="row">
          <button className="btn-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button className="btn-quiet" type="button" onClick={onClose} disabled={busy}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function PickTemplate({ onClose, onPick }: {
  onClose: () => void;
  onPick: (template: SurveyTemplate) => void;
}): ReactElement {
  const [templates, setTemplates] = useState<SurveyTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    surveyTemplates()
      .then(setTemplates)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить шаблоны.'));
  }, []);

  useEffect(load, [load]);

  const remove = async (template: SurveyTemplate) => {
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;

    try {
      await deleteSurveyTemplate(template.id);
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить шаблон.');
    }
  };

  const pick = (template: SurveyTemplate) => {
    if (window.confirm(`Заменить вопросы в форме вопросами шаблона «${template.name}»?`)) onPick(template);
  };

  return (
    <Modal title="Готовые шаблоны" onClose={onClose}>
      {error ? <p className="note note-danger">{error}</p> : null}
      {templates === null && !error ? <p className="text-muted">Загружаем…</p> : null}
      {templates?.length === 0 ? (
        <p className="text-muted">
          Шаблонов пока нет. Составьте вопросы и нажмите «Сохранить шаблон» внизу формы.
        </p>
      ) : null}

      {templates && templates.length > 0 ? (
        <ul className="survey-templates">
          {templates.map((template) => (
            <li className="survey-templates__item" key={template.id}>
              <button className="survey-templates__pick" type="button" onClick={() => pick(template)}>
                <strong>{template.name}</strong>
                <span className="text-muted small">
                  {template.questions.length} {questionsWord(template.questions.length)} · {dayTime(template.updatedAt)}
                </span>
              </button>
              <button
                className="btn-tool"
                type="button"
                onClick={() => void remove(template)}
                aria-label={`Удалить шаблон «${template.name}»`}
                title="Удалить шаблон"
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}

function Results({ results }: { results: SurveyResults }): ReactElement {
  const [reading, setReading] = useState<SurveyQuestionResult | null>(null);

  if (results.responses === 0) return <p className="text-muted">Ответов пока нет.</p>;

  return (
    <div className="survey-results">
      <p className="text-muted small">
        Ответов: {results.responses}. Средняя — по тем, кто поставил оценку; «не пользовались» в неё не входят.
      </p>

      {results.questions.map((question) => (typeOf(question) === 'text' ? (
        <div className="survey-results__question" key={question.key}>
          <div className="survey-results__head">
            <span className="survey-results__avg survey-results__avg--text" aria-hidden="true">Аа</span>
            <span className="survey-results__text">
              {question.text}
              <span className="text-muted small"> · открытый вопрос, ответов {question.answered}</span>
            </span>
            {question.answered > 0 ? (
              <button className="btn-quiet btn-sm" type="button" onClick={() => setReading(question)}>
                Ответы
              </button>
            ) : null}
          </div>
        </div>
      ) : <QuestionResult key={question.key} question={question} />))}

      {reading ? <Answers surveyId={results.id} question={reading} onClose={() => setReading(null)} /> : null}
    </div>
  );
}

/** Открытые ответы на вопрос — в окне с прокруткой, в случайном порядке. */
function Answers({ surveyId, question, onClose }: {
  surveyId: number;
  question: SurveyQuestionResult;
  onClose: () => void;
}): ReactElement {
  const [answers, setAnswers] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    textAnswers(surveyId, question.key)
      .then(setAnswers)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить ответы.'));
  }, [surveyId, question.key]);

  return (
    <Modal title="Ответы" onClose={onClose}>
      <p className="survey-answers__question">{question.text}</p>
      {error ? <p className="note note-danger">{error}</p> : null}
      {answers === null && !error ? <p className="text-muted">Загружаем…</p> : null}
      {answers ? (
        <>
          <p className="text-muted small">Ответов: {answers.length}. Порядок случайный — по нему нельзя понять, кто отвечал.</p>
          <ol className="survey-answers">
            {answers.map((answer, index) => <li key={index}>{answer}</li>)}
          </ol>
        </>
      ) : null}
    </Modal>
  );
}

/** Средняя крупно и столбики 1..10 — видно и «сколько», и «как разошлись». */
function QuestionResult({ question }: { question: SurveyQuestionResult }): ReactElement {
  const peak = Math.max(1, ...question.distribution);
  const tone = question.average === null ? '' : question.average >= 8 ? ' is-good' : question.average >= 5 ? ' is-mid' : ' is-bad';

  return (
    <div className="survey-results__question">
      <div className="survey-results__head">
        <span className={`survey-results__avg${tone}`}>{question.average ?? '—'}</span>
        <span>
          {question.text}
          <span className="text-muted small">
            {' · '}оценок {question.answered}{question.optional && question.skipped > 0 ? `, не пользовались ${question.skipped}` : ''}
          </span>
        </span>
      </div>

      <div className="survey-results__bars" aria-label={`Раскладка оценок: ${question.distribution.join(', ')}`}>
        {question.distribution.map((count, index) => (
          <div className="survey-results__bar" key={index} title={`${index + 1}: ${count}`}>
            <span className="survey-results__count">{count > 0 ? count : ''}</span>
            <span className="survey-results__fill" style={{ height: `${(count / peak) * 100}%` }} />
            <span className="survey-results__label">{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
