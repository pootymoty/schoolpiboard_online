import { api } from '../api/client';
import type { SchoolBonus } from '../api/types';

/**
 * Начать вход через «Школу π» (или привязку аккаунта школы к уже
 * вошедшему): сервер кладёт служебную куку и отвечает адресом страницы
 * входа школы, куда браузер и уходит.
 */
export async function startSchoolPi(mode: 'login' | 'link'): Promise<void> {
  const { url } = await api<{ url: string }>('/auth/schoolpi/start', { method: 'POST', body: { mode } });
  window.location.assign(url);
}

function day(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Что сказать человеку о бонусе — те же слова, что и в письме. */
export function bonusText(bonus: SchoolBonus): string {
  switch (bonus.kind) {
    case 'extended':
      return `К вашему тарифу «${bonus.planName}» добавлено ${bonus.days} дн. — теперь он действует до ${day(bonus.until)}.`;
    case 'paused':
      return `Вам начислено ${bonus.days} дн. тарифа «${bonus.planName}» — до ${day(bonus.until)}. `
        + `Тариф «${bonus.pausedPlan ?? ''}» на это время на паузе и продолжится `
        + `${day(bonus.resumesAt ?? bonus.until)} — оставшиеся дни не пропадут.`;
    default:
      return `Вам начислено ${bonus.days} дн. тарифа «${bonus.planName}» — до ${day(bonus.until)}.`;
  }
}
