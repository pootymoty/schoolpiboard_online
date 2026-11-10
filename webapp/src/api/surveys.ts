import { api } from './client';

/** Оценка от 1 до 10 или открытый ответ. */
export type SurveyQuestionType = 'scale' | 'text';

/**
 * Вопрос опроса. `optional` у оценки — можно ответить «не пользовался»;
 * открытый ответ необязателен всегда.
 */
export interface SurveyQuestion {
  key: string;
  text: string;
  optional: boolean;
  /** У опросов, отправленных до появления типов, поля нет — это оценка. */
  type?: SurveyQuestionType;
}

/** Вопрос в редакторе: без ключа — его ставит сервер при отправке. */
export interface SurveyQuestionDraft {
  text: string;
  type: SurveyQuestionType;
  optional: boolean;
}

export const typeOf = (question: { type?: SurveyQuestionType }): SurveyQuestionType => question.type ?? 'scale';

export interface SurveyForm {
  id: number;
  createdAt: string;
  closed: boolean;
  answered: boolean;
  /** Ушло ли этому человеку письмо с опросом. Отвечать может только он. */
  invited: boolean;
  questions: SurveyQuestion[];
  maxText: number;
}

export interface AdminSurvey {
  id: number;
  createdAt: string;
  recipients: number;
  sent: number;
  responses: number;
  closedAt: string | null;
}

export interface AdminSurveyPage {
  items: AdminSurvey[];
  total: number;
  /** Скольким пользователям уйдёт письмо, если отправить опрос сейчас. */
  recipientsNow: number;
}

export interface SurveyQuestionResult {
  key: string;
  text: string;
  type: SurveyQuestionType;
  optional: boolean;
  answered: number;
  skipped: number;
  average: number | null;
  /** Сколько раз поставили 1, 2, …, 10. У открытого вопроса пусто. */
  distribution: number[];
}

export interface SurveyResults {
  id: number;
  responses: number;
  questions: SurveyQuestionResult[];
}

export interface SurveyTemplate {
  id: number;
  name: string;
  updatedAt: string;
  questions: SurveyQuestion[];
}

export interface SurveyFormLimits {
  questions: SurveyQuestion[];
  maxQuestions: number;
  maxQuestionLength: number;
}

export const surveyForm = (id: number) => api<SurveyForm>(`/surveys/${id}`);

export const answerSurvey = (
  id: number, scores: Record<string, number | null>, texts: Record<string, string>,
) => api<{ message: string }>(`/surveys/${id}/answer`, { method: 'POST', body: { scores, texts } });

export const adminSurveys = (page: number) => api<AdminSurveyPage>(`/admin/surveys?page=${page}`);

/** С чего начинать форму: вопросы последнего отправленного опроса. */
export const surveyTemplate = () => api<SurveyFormLimits>('/admin/surveys/template');

export const createSurvey = (questions: SurveyQuestionDraft[]) =>
  api<{ id: number; recipients: number }>('/admin/surveys', { method: 'POST', body: { questions } });

export const surveyResults = (id: number) => api<SurveyResults>(`/admin/surveys/${id}`);

/** Открытые ответы на вопрос — сервер каждый раз отдаёт их в случайном порядке. */
export const textAnswers = (id: number, key: string) =>
  api<string[]>(`/admin/surveys/${id}/answers/${encodeURIComponent(key)}`);

export const closeSurvey = (id: number) => api<unknown>(`/admin/surveys/${id}/close`, { method: 'POST' });

export const surveyTemplates = () => api<SurveyTemplate[]>('/admin/surveys/templates');

/** Без `overwrite` шаблон с тем же названием не трогается — сервер ответит `template_exists`. */
export const saveSurveyTemplate = (name: string, questions: SurveyQuestionDraft[], overwrite = false) =>
  api<{ replaced: boolean; message: string }>('/admin/surveys/templates', {
    method: 'POST',
    body: { name, questions, overwrite },
  });

export const deleteSurveyTemplate = (id: number) => api<unknown>(`/admin/surveys/templates/${id}`, { method: 'DELETE' });
