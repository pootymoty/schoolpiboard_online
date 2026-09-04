import { api } from './client';
import type { ItemData, ItemType } from '../board/protocol';

/**
 * Папка «Мои заготовки».
 *
 * Заготовка принадлежит человеку, а не доске: её сохраняют затем, чтобы
 * поставить на следующем занятии. Поэтому она и живёт на сервере, а не в
 * хранилище браузера — иначе с другого компьютера её не достать.
 */
export interface TemplateItem {
  type: ItemType;
  data: ItemData;
}

export interface UserTemplate {
  id: number;
  title: string;
  count: number;
  createdAt: string;
  /** Объекты заготовки строкой JSON — сервер её не разбирает, только проверяет. */
  body: string;
}

export function listTemplates(): Promise<UserTemplate[]> {
  return api<UserTemplate[]>('/templates');
}

export function saveTemplate(title: string, items: TemplateItem[]): Promise<UserTemplate> {
  return api<UserTemplate>('/templates', {
    method: 'POST',
    body: { title, body: JSON.stringify(items) },
  });
}

export function deleteTemplate(templateId: number): Promise<void> {
  return api<void>(`/templates/${templateId}`, { method: 'DELETE' });
}

/** Объекты заготовки. Испорченное содержимое молча считаем пустым: ронять доску незачем. */
export function itemsOf(template: UserTemplate): TemplateItem[] {
  try {
    const parsed = JSON.parse(template.body) as TemplateItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
