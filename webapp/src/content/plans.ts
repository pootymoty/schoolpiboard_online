import type { Plan } from '../api/types';

/**
 * Тарифы для показа до ответа сервера.
 *
 * Страница цен собирается в статический HTML, а тарифы лежат в базе — и
 * при сборке спросить их не у кого. Без этих значений поисковик (и тот,
 * у кого страница ещё не догрузилась) видел бы страницу «Тарифы» вообще
 * без цен: ровно то, за чем на неё и приходят.
 *
 * Значения повторяют посев миграции `20260902120000_Plans`. Считает
 * деньги всегда база — сюда цена не попадает ни при оплате, ни при
 * проверке пределов; здесь она только показывается. Поэтому расхождение
 * ничем не грозит, кроме устаревшей витрины, но менять цены нужно в двух
 * местах сразу.
 */
export const SHOWN_PLANS: Plan[] = [
  {
    code: 'free',
    name: 'Бесплатный',
    price30: 0, price90: 0, price180: 0, price365: 0,
    maxBoards: 30,
    maxStorageBytes: 52428800,
    maxParticipants: 2,
    hasLibrary: false,
  },
  {
    code: 'standard',
    name: 'Стандартный',
    price30: 190, price90: 490, price180: 950, price365: 1690,
    maxBoards: 100,
    maxStorageBytes: 524288000,
    maxParticipants: 5,
    hasLibrary: true,
  },
  {
    code: 'extended',
    name: 'Расширенный',
    price30: 490, price90: 1290, price180: 2490, price365: 4390,
    maxBoards: 200,
    maxStorageBytes: 2147483648,
    maxParticipants: 10,
    hasLibrary: true,
  },
  {
    code: 'deep',
    name: 'Углублённый',
    price30: 990, price90: 2690, price180: 4990, price365: 8900,
    maxBoards: 500,
    maxStorageBytes: 5368709120,
    maxParticipants: 20,
    hasLibrary: true,
  },
];
