import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { adminSurveys, closeSurvey, sendSurvey, surveyResults } from '../api/surveys';
import type { AdminSurvey, SurveyQuestionResult, SurveyResults } from '../api/surveys';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';

/** Опросов на странице. */
const SIZE = 10;

function dayTime(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Опросы пользователей: отправить новый и посмотреть результаты прошлых.
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

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState<number | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);

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

  const send = async () => {
    setBusy(true);
    setError(null);

    try {
      const answer = await sendSurvey();
      setNote(`Опрос создан, письма уходят ${answer.recipients} пользователям — по одному, это займёт пару минут.`);
      setConfirming(false);
      setPage(1);
      load(1);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отправить опрос.');
    } finally {
      setBusy(false);
    }
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
        <div className="page-header__actions">
          <button className="btn-primary" type="button" onClick={() => setConfirming(true)}>
            Отправить опрос
          </button>
        </div>
      </div>

      {note ? <p className="note note-success">{note}</p> : null}
      {error ? <p className="note note-danger">{error}</p> : null}

      <section className="card">
        <h2 className="card-title">Результаты{total > 0 ? ` · ${total}` : ''}</h2>

        {items.length === 0 ? (
          <p className="text-muted">Опросов ещё не было.</p>
        ) : (
          <table className="admin__table">
            <thead>
              <tr>
                <th>Опрос</th>
                <th>Писем</th>
                <th>Ответов</th>
                <th>Состояние</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {items.map((one) => (
                <Fragment key={one.id}>
                  <tr>
                    <td>№{one.id} · {dayTime(one.createdAt)}</td>
                    <td>{one.sent} из {one.recipients}</td>
                    <td>{one.responses}</td>
                    <td>{one.closedAt ? `закрыт ${dayTime(one.closedAt)}` : 'идёт'}</td>
                    <td>
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
                    </td>
                  </tr>

                  {open === one.id ? (
                    <tr className="admin__open">
                      <td colSpan={5}>
                        {results?.id === one.id ? <Results results={results} /> : <p className="text-muted">Загружаем…</p>}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 ? <Pagination page={page} count={pages} onPage={setPage} label="Страницы списка опросов" /> : null}
      </section>

      {confirming ? (
        <Modal title="Отправить опрос?" onClose={() => setConfirming(false)}>
          <p>
            Письмо со ссылкой на опрос получат <b>{recipients}</b> пользователей — все, у кого подтверждена
            почта. Отменить отправку будет нельзя.
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
    </Page>
  );
}

function Results({ results }: { results: SurveyResults }): ReactElement {
  if (results.responses === 0) return <p className="text-muted">Ответов пока нет.</p>;

  return (
    <div className="survey-results">
      <p className="text-muted small">
        Ответов: {results.responses}. Средняя — по тем, кто поставил оценку; «не пользовались» в неё не входят.
      </p>

      {results.questions.map((question) => <QuestionResult key={question.key} question={question} />)}

      <h3 className="survey-results__title">Замечания и предложения{results.comments.length > 0 ? ` · ${results.comments.length}` : ''}</h3>
      {results.comments.length === 0 ? (
        <p className="text-muted small">Никто ничего не написал.</p>
      ) : (
        <ul className="survey-results__comments">
          {results.comments.map((comment, index) => <li key={index}>{comment}</li>)}
        </ul>
      )}
    </div>
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
