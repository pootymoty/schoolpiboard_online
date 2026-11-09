import { api } from './client';

/** Вопрос опроса: оценка 1..10; `optional` — можно ответить «не пользовался». */
export interface SurveyQuestion {
  key: string;
  text: string;
  optional: boolean;
}

export interface SurveyForm {
  id: number;
  createdAt: string;
  closed: boolean;
  answered: boolean;
  questions: SurveyQuestion[];
  maxComment: number;
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
  optional: boolean;
  answered: number;
  skipped: number;
  average: number | null;
  /** Сколько раз поставили 1, 2, …, 10. */
  distribution: number[];
}

export interface SurveyResults {
  id: number;
  responses: number;
  questions: SurveyQuestionResult[];
  comments: string[];
}

export const surveyForm = (id: number) => api<SurveyForm>(`/surveys/${id}`);

export const answerSurvey = (id: number, scores: Record<string, number | null>, comment: string) =>
  api<{ message: string }>(`/surveys/${id}/answer`, { method: 'POST', body: { scores, comment } });

export const adminSurveys = (page: number) => api<AdminSurveyPage>(`/admin/surveys?page=${page}`);

export const sendSurvey = () => api<{ id: number; recipients: number }>('/admin/surveys', { method: 'POST' });

export const surveyResults = (id: number) => api<SurveyResults>(`/admin/surveys/${id}`);

export const closeSurvey = (id: number) => api<unknown>(`/admin/surveys/${id}/close`, { method: 'POST' });
