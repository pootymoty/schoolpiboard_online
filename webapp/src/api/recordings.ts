import { api } from './client';

/**
 * Записи занятий.
 *
 * Доступны только зарегистрированным участникам доски — гостю нет,
 * даже если он был на занятии в момент записи: у него нет учётной
 * записи, к которой это привязать. Управление (старт/пауза/стоп) идёт
 * через хаб, а не сюда: это команда доске, а не запрос к архиву.
 */
export interface RecordingInfo {
  id: number;
  title: string | null;
  status: 'recording' | 'paused' | 'stopped';
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
}

export interface RecordingStep {
  id: number;
  offsetMs: number;
  name: string;
  payload: unknown;
}

export function listRecordings(boardId: number): Promise<RecordingInfo[]> {
  return api<RecordingInfo[]>(`/boards/${boardId}/recordings`);
}

/** Та же запись, но с именем доски — для «Мои записи», где доски смешаны. */
export interface RecordingLibraryEntry {
  id: number;
  boardId: number;
  boardTitle: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  /** Переименовать и удалить может только владелец той доски. */
  canManage: boolean;
}

/** Все готовые записи по всем доскам, куда есть доступ. */
export function listMyRecordings(): Promise<RecordingLibraryEntry[]> {
  return api<RecordingLibraryEntry[]>('/recordings');
}

export function getRecording(
  boardId: number, recordingId: number,
): Promise<{ recording: RecordingInfo; steps: RecordingStep[] }> {
  return api(`/boards/${boardId}/recordings/${recordingId}`);
}

export function deleteRecording(boardId: number, recordingId: number): Promise<void> {
  return api<void>(`/boards/${boardId}/recordings/${recordingId}`, { method: 'DELETE' });
}

export function renameRecording(boardId: number, recordingId: number, title: string): Promise<void> {
  return api<void>(`/boards/${boardId}/recordings/${recordingId}`, { method: 'PATCH', body: { title } });
}
