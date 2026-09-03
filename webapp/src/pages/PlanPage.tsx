import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Page } from '../components/Layout';
import { humanSize } from '../api/files';
import type { MyPlan, Plan } from '../api/types';

/** Периоды продажи. Тариф отвечает за пределы, период — только за срок. */
const PERIODS = [
  { days: 30, title: '30 дней', field: 'price30' as const },
  { days: 90, title: '90 дней', field: 'price90' as const },
  { days: 180, title: '180 дней', field: 'price180' as const },
  { days: 365, title: '365 дней', field: 'price365' as const },
];

/** Полоса заполнения предела: занято из положенного. */
function Bar({ used, total }: { used: number; total: number }): ReactElement {
  const share = total > 0 ? Math.min(1, used / total) : 0;

  return (
    <div className="files__bar">
      <span style={{ width: `${share * 100}%` }} />
    </div>
  );
}

/**
 * Мой тариф: что действует, до какого числа и сколько израсходовано.
 *
 * Пределы показаны с расходом, а не списком возможностей: человек
 * приходит сюда, когда упёрся, и первым делом хочет увидеть, во что.
 */
export function PlanPage(): ReactElement {
  const [mine, setMine] = useState<MyPlan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Чем кончилась оплата. Робокасса возвращает человека с пометкой в
   * адресе; читаем её один раз и адрес сразу чистим, иначе обновление
   * страницы через час снова показало бы «оплата принята».
   */
  const [outcome, setOutcome] = useState<'paid' | 'failed' | null>(null);
  const [search, setSearch] = useSearchParams();

  /** Что покупаем: тариф и срок. */
  const [code, setCode] = useState<string | null>(null);
  const [period, setPeriod] = useState(PERIODS[0]);
  // Выключено по умолчанию намеренно: согласие на регулярное списание с
  // карты человек даёт сам, а не забывает снять чужую галочку.
  const [renew, setRenew] = useState(false);

  const load = () => {
    api<MyPlan>('/billing/me')
      .then(setMine)
      .catch((reason) => setError(
        reason instanceof ApiError ? reason.message : 'Не удалось загрузить тариф.',
      ));
  };

  useEffect(() => {
    const mark = search.get('paid');
    if (mark === null) return;

    setOutcome(mark === '1' ? 'paid' : 'failed');

    const rest = new URLSearchParams(search);
    rest.delete('paid');
    setSearch(rest, { replace: true });
    // Намеренно один раз, при возвращении с оплаты.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * После оплаты срок продлевает не браузер: деньги подтверждает Робокасса,
   * сообщает сервису ключей, а тот — доске. Пока эта цепочка идёт, человек
   * уже вернулся и видит прежний тариф. Поэтому несколько раз перечитываем
   * — без этого оплата выглядит как пропавшая.
   */
  useEffect(() => {
    if (outcome !== 'paid') return;

    let alive = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      if (!alive) return;
      attempts += 1;

      try {
        const answer = await api<MyPlan>('/billing/me');
        if (!alive) return;

        setMine(answer);
        if (answer.kind === 'paid') return;
      } catch {
        // Молчим: это фоновая перепроверка, а не действие человека.
      }

      if (alive && attempts < 6) timer = setTimeout(() => void check(), 3000);
    };

    timer = setTimeout(() => void check(), 2000);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [outcome]);

  useEffect(() => {
    load();
    api<Plan[]>('/plans')
      .then((rows) => {
        const paid = rows.filter((row) => row.price30 > 0);
        setPlans(paid);
        setCode((current) => current ?? paid[0]?.code ?? null);
      })
      .catch(() => undefined);
  }, []);

  const chosen = plans.find((plan) => plan.code === code) ?? null;
  const price = chosen ? chosen[period.field] : 0;

  /**
   * Уводит на оплату. Счёт выставляет сервер ключей: платёжных данных у
   * доски нет и не будет, поэтому и цену, и счёт считает не браузер.
   */
  const pay = async () => {
    if (!chosen) return;

    setBusy(true);
    setError(null);

    try {
      const answer = await api<{ paymentUrl: string }>('/billing/checkout', {
        method: 'POST',
        body: { planCode: chosen.code, days: period.days, autoRenew: renew },
      });

      window.location.href = answer.paymentUrl;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перейти к оплате.');
      setBusy(false);
    }
  };

  const toggleRenew = async (value: boolean) => {
    try {
      await api('/billing/auto-renew', { method: 'POST', body: { value } });
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить автопродление.');
    }
  };

  const until = mine?.until
    ? new Date(mine.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <Page narrow>
      <div className="page-header">
        <h1>Мой тариф</h1>
      </div>

      {outcome === 'paid' ? (
        <p className="note note-info">
          Оплата принята. Срок обновится в течение минуты — страница сама покажет новый.
        </p>
      ) : null}

      {outcome === 'failed' ? (
        <p className="note note-danger">
          Оплата не прошла, деньги не списаны. Можно попробовать ещё раз.
        </p>
      ) : null}

      {error ? <p className="note note-danger">{error}</p> : null}

      {mine ? (
        <>
          <section className="card">
            <h2 className="card-title">{mine.plan.name}</h2>

            {mine.kind === 'trial' && until ? (
              <p className="note note-info">
                Пробный период до {until}. Дальше аккаунт вернётся к бесплатным пределам —
                ничего не пропадёт.
              </p>
            ) : null}

            {mine.kind === 'paid' && until ? (
              <p className="text-muted">Оплачено до {until}.</p>
            ) : null}

            {mine.kind === 'free' ? (
              <p className="text-muted">
                Бесплатный тариф — без срока. Платный расширяет пределы и открывает
                библиотеку документов.
              </p>
            ) : null}

            <div className="stack" style={{ marginTop: 'var(--sp-4)' }}>
              <div>
                <p className="small" style={{ margin: '0 0 2px' }}>
                  Доски: {mine.boards} из {mine.plan.maxBoards}
                </p>
                <Bar used={mine.boards} total={mine.plan.maxBoards} />
              </div>

              <div>
                <p className="small" style={{ margin: '0 0 2px' }}>
                  Файлы: {humanSize(mine.storageUsed)} из {humanSize(mine.plan.maxStorageBytes)}
                </p>
                <Bar used={mine.storageUsed} total={mine.plan.maxStorageBytes} />
              </div>

              <p className="text-muted small" style={{ margin: 0 }}>
                На доске одновременно — до {mine.plan.maxParticipants} человек, считая вас.
                Библиотека документов {mine.plan.hasLibrary ? 'доступна' : 'на платных тарифах'}.
              </p>
            </div>
          </section>

          {mine.kind === 'paid' ? (
            <section className="card">
              <h2 className="card-title">Автопродление</h2>

              <div className="check">
                <input
                  id="autoRenew"
                  type="checkbox"
                  checked={mine.autoRenew}
                  onChange={(event) => void toggleRenew(event.target.checked)}
                />
                <label htmlFor="autoRenew">Продлевать подписку автоматически</label>
              </div>

              <p className="text-muted small">
                Списываем с той же карты за сутки до конца срока. Выключить можно
                в любой момент — оплаченные дни остаются при вас.
              </p>
            </section>
          ) : null}

          <section className="card">
            <h2 className="card-title">{mine.kind === 'free' ? 'Выбрать тариф' : 'Продлить или сменить'}</h2>

            {plans.length === 0 ? (
              <p className="text-muted">Загружаем тарифы…</p>
            ) : (
              <>
                <p className="params__label">Тариф</p>
                <div className="row">
                  {plans.map((plan) => (
                    <button
                      key={plan.code}
                      className={plan.code === code ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}
                      type="button"
                      onClick={() => setCode(plan.code)}
                    >
                      {plan.name}
                    </button>
                  ))}
                </div>

                <p className="params__label">Срок</p>
                <div className="row">
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

                <div className="check" style={{ marginTop: 'var(--sp-3)' }}>
                  <input
                    id="renewOnBuy"
                    type="checkbox"
                    checked={renew}
                    onChange={(event) => setRenew(event.target.checked)}
                  />
                  <label htmlFor="renewOnBuy">Продлевать автоматически</label>
                </div>

                <button
                  className="btn-primary btn-block"
                  type="button"
                  disabled={!chosen || busy}
                  onClick={() => void pay()}
                  style={{ marginTop: 'var(--sp-4)' }}
                >
                  {busy ? 'Готовим оплату…' : `Оплатить ${price} ₽`}
                </button>

                <p className="text-muted small">
                  Оплата через Робокассу. Оплаченные дни прибавляются к концу
                  текущего срока — ничего не пропадает.
                </p>
              </>
            )}

            <Link className="btn btn-quiet btn-sm" to="/pricing">Сравнить тарифы</Link>
          </section>
        </>
      ) : error ? null : (
        <p className="text-muted">Загружаем…</p>
      )}
    </Page>
  );
}
