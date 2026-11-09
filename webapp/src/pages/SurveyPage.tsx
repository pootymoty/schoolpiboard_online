import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { answerSurvey, surveyForm } from '../api/surveys';
import type { SurveyForm } from '../api/surveys';
import { Page } from '../components/Layout';

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** «Не пользовался» — отдельное значение, чтобы отличать его от «ещё не ответил». */
const SKIP = 0;

/**
 * Опрос о доске. Открывается по ссылке из письма и только после входа —
 * так каждый отвечает один раз. Ответ при этом обезличен: сервер хранит
 * отдельно «этот человек ответил» и сами оценки, без связи между ними.
 */
export function SurveyPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const surveyId = Number(id);

  const [form, setForm] = useState<SurveyForm | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    surveyForm(surveyId)
      .then(setForm)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть опрос.'));
  }, [surveyId]);

  const missing = form?.questions.filter((question) => scores[question.key] === undefined) ?? [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || missing.length > 0) {
      setError('Ответьте, пожалуйста, на все вопросы — у функций можно выбрать «Не пользовался».');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload = Object.fromEntries(
        form.questions.map((question) => [question.key, scores[question.key] === SKIP ? null : scores[question.key]]),
      );
      const answer = await answerSurvey(form.id, payload, comment);
      setDone(answer.message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отправить ответ.');
    } finally {
      setBusy(false);
    }
  };

  if (done || form?.answered) {
    return (
      <Page narrow>
        <section className="card survey">
          <h1>Спасибо!</h1>
          <p>{done ?? 'Вы уже ответили на этот опрос.'} Ваши оценки помогут сделать доску лучше.</p>
          <Link className="btn btn-primary" to="/boards">К доскам</Link>
        </section>
      </Page>
    );
  }

  if (form?.closed) {
    return (
      <Page narrow>
        <section className="card survey">
          <h1>Опрос закрыт</h1>
          <p>Ответы на этот опрос больше не принимаются. Спасибо, что заглянули!</p>
          <Link className="btn btn-primary" to="/boards">К доскам</Link>
        </section>
      </Page>
    );
  }

  return (
    <Page narrow>
      <form className="card survey" onSubmit={submit}>
        <h1>Опрос о Доске Пи</h1>
        <p className="text-muted">
          Оцените от 1 до 10, где <b>1 — плохо</b>, <b>10 — отлично</b>. Если какой-то функцией не пользовались,
          так и отметьте. Ответы обезличены: мы видим оценки, но не то, кто их поставил.
        </p>

        {!form && !error ? <p className="text-muted">Загружаем…</p> : null}

        {form?.questions.map((question, index) => (
          <fieldset className="survey__question" key={question.key}>
            <legend>{index + 1}. {question.text}</legend>

            <div className="survey__scale" role="radiogroup" aria-label={question.text}>
              {SCALE.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="survey__score"
                  role="radio"
                  aria-checked={scores[question.key] === value}
                  onClick={() => setScores((current) => ({ ...current, [question.key]: value }))}
                >
                  {value}
                </button>
              ))}
            </div>

            {question.optional ? (
              <label className="survey__skip">
                <input
                  type="checkbox"
                  checked={scores[question.key] === SKIP}
                  onChange={(event) => setScores((current) => {
                    const next = { ...current };
                    if (event.target.checked) next[question.key] = SKIP;
                    else delete next[question.key];
                    return next;
                  })}
                />
                Не пользовался
              </label>
            ) : null}
          </fieldset>
        ))}

        {form ? (
          <div className="field">
            <label htmlFor="surveyComment">Что улучшить? Замечания, предложения, жалобы — всё, что хотите сказать</label>
            <textarea
              id="surveyComment"
              rows={6}
              maxLength={form.maxComment}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
        ) : null}

        {error ? <p className="note note-danger">{error}</p> : null}

        {form ? (
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Отправляем…' : 'Отправить ответ'}
          </button>
        ) : null}
      </form>
    </Page>
  );
}
