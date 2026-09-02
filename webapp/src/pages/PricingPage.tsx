import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';
import type { Plan } from '../api/types';
import { IconCheck, IconClose } from '../components/Icons';

/** Периоды продажи. Тариф отвечает за пределы, период — только за срок. */
const PERIODS = [
  { days: 30, title: '30 дней', field: 'price30' as const },
  { days: 90, title: '90 дней', field: 'price90' as const },
  { days: 180, title: '180 дней', field: 'price180' as const },
  { days: 365, title: '365 дней', field: 'price365' as const },
];

function storage(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024 ? `${Math.round(megabytes / 1024)} ГБ` : `${Math.round(megabytes)} МБ`;
}

/**
 * Тарифы.
 *
 * Бесплатный уровень стоит в одном ряду с платными: человек должен
 * видеть, что у него уже есть, рядом с тем, что он получит за деньги.
 */
export function PricingPage(): ReactElement {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Plan[]>('/plans')
      .then(setPlans)
      .catch((reason) => setError(
        reason instanceof ApiError ? reason.message : 'Не удалось загрузить тарифы.',
      ));
  }, []);

  return (
    <Page>
      <section className="card" style={{ textAlign: 'center' }}>
        <h1>Тарифы</h1>
        <p className="reading" style={{ margin: '0 auto var(--sp-4)' }}>
          Платит только преподаватель. Ученикам регистрация не нужна: они заходят
          по ссылке и ничего не платят.
        </p>

        <div className="row" style={{ justifyContent: 'center' }}>
          {PERIODS.map((option) => (
            <button
              key={option.days}
              className={option.days === period.days ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}
              type="button"
              onClick={() => setPeriod(option)}
            >
              {option.title}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="note note-danger">{error}</p> : null}

      <div className="plans">
        {plans.map((plan) => {
          const price = plan[period.field];

          return (
            <article className="plan" key={plan.code}>
              <h2 className="plan__name">{plan.name}</h2>

              <p className="plan__price">
                {price === 0 ? 'Бесплатно' : `${price} ₽`}
                {price === 0 ? null : <span className="plan__period"> / {period.title}</span>}
              </p>

              <ul className="plan__list">
                <li>{plan.maxBoards} досок</li>
                <li>до {plan.maxParticipants} человек на доске</li>
                <li>{storage(plan.maxStorageBytes)} под файлы</li>
                <li className={plan.hasLibrary ? undefined : 'plan__no'}>
                  {plan.hasLibrary ? <IconCheck size={16} /> : <IconClose size={16} />}
                  {' '}библиотека документов и страницы PDF
                </li>
                <li><IconCheck size={16} /> сохранение доски картинкой</li>
              </ul>

              {price === 0 ? (
                <Link className="btn btn-outline btn-block" to={user ? '/boards' : '/register'}>
                  {user ? 'Мои доски' : 'Начать бесплатно'}
                </Link>
              ) : (
                <Link className="btn btn-primary btn-block" to={user ? '/plan' : '/register'}>
                  {user ? 'Выбрать' : 'Попробовать'}
                </Link>
              )}
            </article>
          );
        })}
      </div>

      <section className="card">
        <h2 className="card-title">Что важно знать</h2>
        <ul className="reading">
          <li>Первые 7 дней после регистрации — «Стандартный», без привязки карты.</li>
          <li>Оплата разовая за выбранный срок. Продление прибавляет дни к концу текущего, а не обнуляет его.</li>
          <li>
            Когда оплаченный срок кончается, ничего не удаляется: доски и файлы остаются
            на месте, аккаунт просто возвращается к бесплатным пределам.
          </li>
          <li>Ученики и коллеги, которых вы позвали по ссылке, не платят ничего и никогда.</li>
        </ul>
      </section>
    </Page>
  );
}
