import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Page } from '../components/Layout';
import { humanSize } from '../api/files';
import type { MyPlan, Order, Plan } from '../api/types';

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
  const [orders, setOrders] = useState<Order[]>([]);

  /** Начать новый тариф сразу, а не после текущего срока. */
  const [now, setNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Чем кончилась оплата. Робокасса возвращает человека на отдельный
   * адрес; запоминаем его один раз и сразу уходим на обычный «Мой тариф»,
   * иначе обновление страницы через час снова показало бы «оплата
   * принята», а ссылку можно было бы переслать.
   */
  const [outcome, setOutcome] = useState<'paid' | 'failed' | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /** Что покупаем: тариф и срок. */
  const [code, setCode] = useState<string | null>(null);
  const [period, setPeriod] = useState(PERIODS[0]);
  // Выключено по умолчанию намеренно: согласие на регулярное списание с
  // карты человек даёт сам, а не забывает снять чужую галочку.
  const [renew, setRenew] = useState(false);

  /**
   * Текст, под которым человек соглашается на автосписания.
   *
   * Уезжает на сервер вместе с покупкой и ложится в журнал согласий:
   * формулировку когда-нибудь поменяют, а в споре о списании спросят ту,
   * что была написана рядом с галочкой в тот день.
   */
  const CONSENT = 'Я согласен на автоматические списания согласно условиям оферты';

  const loadOrders = () => {
    api<Order[]>('/billing/history').then(setOrders).catch(() => undefined);
  };

  const load = () => {
    api<MyPlan>('/billing/me')
      .then(setMine)
      .catch((reason) => setError(
        reason instanceof ApiError ? reason.message : 'Не удалось загрузить тариф.',
      ));
  };

  useEffect(() => {
    if (pathname !== '/plan/paid' && pathname !== '/plan/failed') return;

    setOutcome(pathname === '/plan/paid' ? 'paid' : 'failed');
    navigate('/plan', { replace: true });
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
        if (answer.kind === 'paid') {
          // История здесь же: покупка уже отмечена оплаченной.
          loadOrders();
          return;
        }
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
    loadOrders();
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
   * Тариф, уже стоящий в очереди. Пока он там, другой купить нельзя:
   * два разных уровня подряд превратили бы срок в лестницу, по которой
   * не сказать, что действует сейчас и что будет через месяц.
   */
  const waiting = mine?.upcoming[0] ?? null;
  const blocked = Boolean(waiting && chosen && waiting.planCode !== chosen.code);

  /**
   * Повышение уровня поверх действующего платного срока — единственный
   * случай, когда есть смысл спрашивать «сразу или после». Понижать
   * досрочно нельзя: это потеря оплаченных дней без всякой выгоды.
   */
  const upgrade = Boolean(
    chosen && mine && mine.kind !== 'free'
    && mine.upcoming.length === 0
    && chosen.sort > mine.plan.sort,
  );

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
        body: {
          planCode: chosen.code,
          days: period.days,
          autoRenew: renew,
          startNow: now && upgrade,
          consent: renew ? `${CONSENT}. Списание раз в ${period.days} дн., ${price} ₽.` : null,
        },
      });

      window.location.href = answer.paymentUrl;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перейти к оплате.');
      setBusy(false);
    }
  };

  /** Переход на уже оплаченный отложенный тариф. Обратно нельзя — спрашиваем. */
  const startNow = async () => {
    const next = mine?.upcoming[0];
    if (!next) return;

    const sure = window.confirm(
      `Перейти на «${next.planName}» прямо сейчас? Оставшиеся дни текущего тарифа сгорят, `
      + 'и вернуть их будет нельзя.',
    );
    if (!sure) return;

    try {
      await api('/billing/start-now', { method: 'POST' });
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перейти досрочно.');
    }
  };

  const toggleRenew = async (value: boolean) => {
    try {
      await api('/billing/auto-renew', {
        method: 'POST',
        body: { value, consent: value ? CONSENT : null },
      });
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить автопродление.');
    }
  };

  const day = (value: string) => new Date(value)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const until = mine?.until
    ? new Date(mine.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <Page narrow>
      <div className="page-header">
        <h1>Мой тариф</h1>
      </div>

      {outcome === 'paid' ? (
        <p className="note note-info">Оплата принята — обновляем срок.</p>
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
              <p className="note note-info">Пробный период до {until}.</p>
            ) : null}

            {mine.kind === 'paid' && until ? (
              <p className="text-muted">Оплачено до {until}.</p>
            ) : null}

            {mine.kind === 'free' ? (
              <p className="text-muted">Без срока.</p>
            ) : null}

            {/* Владельцу сервиса покупать нечего: пределов у него нет. */}
            {mine.kind === 'admin' ? (
              <p className="text-muted">Без ограничений и без срока.</p>
            ) : null}

            {mine.upcoming.length > 0 ? (
              <div className="note note-info" style={{ marginTop: 'var(--sp-3)' }}>
                <p style={{ margin: '0 0 var(--sp-2)' }}><strong>Дальше</strong></p>

                {mine.upcoming.map((next) => (
                  <p key={next.startsAt} style={{ margin: '0 0 4px' }}>
                    {next.planName} — с {day(next.startsAt)} до {day(next.endsAt)}
                  </p>
                ))}

                {mine.canStartUpcomingNow ? (
                  <button
                    className="btn-quiet btn-sm"
                    type="button"
                    onClick={() => void startNow()}
                    style={{ marginTop: 'var(--sp-2)' }}
                  >
                    Перейти сейчас
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Владельцу сервиса шкалы не нужны: считать проценты от
                предела, которого нет, — значит рисовать полоску до
                двух миллиардов. */}
            {mine.kind === 'admin' ? null : (
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
                Участников на доске: до {mine.plan.maxParticipants}
                {' · '}
                Библиотека: {mine.plan.hasLibrary ? 'есть' : 'нет'}
              </p>
            </div>
            )}
          </section>

          {mine.kind === 'paid' ? (
            <section className="card">
              <h2 className="card-title">Автопродление</h2>

              {mine.canAutoRenew || mine.autoRenew ? (
                <>
                  <div className="check">
                    <input
                      id="autoRenew"
                      type="checkbox"
                      checked={mine.autoRenew}
                      onChange={(event) => void toggleRenew(event.target.checked)}
                    />
                    <label htmlFor="autoRenew">
                      Я согласен на автоматические списания согласно условиям{' '}
                      <Link to="/legal/offer" target="_blank" rel="noreferrer">оферты</Link>
                    </label>
                  </div>

                  <p className="text-muted small">
                    Списание за сутки до конца срока. Письмо — за трое суток до него.
                  </p>
                </>
              ) : (
                <p className="text-muted small">Доступно при следующей оплате.</p>
              )}
            </section>
          ) : null}

          {mine.kind === 'admin' ? null : (
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

                {upgrade ? (
                  <>
                    <p className="params__label">Когда начать</p>

                    <div className="check">
                      <input
                        id="startLater"
                        type="radio"
                        checked={!now}
                        onChange={() => setNow(false)}
                      />
                      <label htmlFor="startLater">После текущего срока</label>
                    </div>

                    <div className="check">
                      <input
                        id="startNow"
                        type="radio"
                        checked={now}
                        onChange={() => setNow(true)}
                      />
                      <label htmlFor="startNow">
                        Сразу — оставшиеся дни «{mine.plan.name}» сгорят
                      </label>
                    </div>
                  </>
                ) : null}

                {chosen && mine && mine.kind !== 'free' && !upgrade ? (
                  <p className="text-muted small">
                    {/* Конец последнего из оплаченных сроков, а не текущего:
                        за ним может стоять очередь. */}
                    Начнётся{' '}
                    {mine.upcoming.length > 0
                      ? day(mine.upcoming[mine.upcoming.length - 1].endsAt)
                      : until ?? 'после текущего срока'}
                  </p>
                ) : null}

                {/* Отметки по умолчанию нет: согласие, проставленное за
                    человека, согласием не является. Рядом — сумма,
                    периодичность и день списания: этого требует платёжная
                    система, и меньше здесь оставить нельзя. */}
                <div className="check" style={{ marginTop: 'var(--sp-3)' }}>
                  <input
                    id="renewOnBuy"
                    type="checkbox"
                    checked={renew}
                    onChange={(event) => setRenew(event.target.checked)}
                  />
                  <label htmlFor="renewOnBuy">
                    Я согласен на автоматические списания согласно условиям{' '}
                    <Link to="/legal/offer" target="_blank" rel="noreferrer">оферты</Link>
                  </label>
                </div>

                {chosen && period ? (
                  <p className="text-muted small">
                    {price} ₽ раз в {period.days} дн., за сутки до конца срока. Выключается
                    в разделе «Автопродление».
                  </p>
                ) : null}

                {blocked && waiting ? (
                  <p className="note note-warning" style={{ marginTop: 'var(--sp-3)' }}>
                    В очереди «{waiting.planName}». Можно докупить дни к нему — или включить
                    его сейчас кнопкой «Перейти сейчас» выше.
                  </p>
                ) : null}

                <button
                  className="btn-primary btn-block"
                  type="button"
                  disabled={!chosen || busy || blocked}
                  onClick={() => void pay()}
                  style={{ marginTop: 'var(--sp-4)' }}
                >
                  {busy ? 'Готовим оплату…' : `Оплатить ${price} ₽`}
                </button>

                <p className="text-muted small">Оплата через Робокассу.</p>
              </>
            )}

            <Link className="btn btn-quiet btn-sm" to="/pricing">Сравнить тарифы</Link>
          </section>
          )}

          {orders.length > 0 ? (
            <section className="card">
              <h2 className="card-title">История покупок</h2>

              <div className="stack">
                {orders.map((order) => (
                  <div key={order.invoiceId}>
                    <p style={{ margin: 0 }}>
                      {order.planName}, {order.days} дн. — {order.amount} ₽
                    </p>
                    <p className="text-muted small" style={{ margin: 0 }}>
                      Счёт № {order.invoiceId} от {day(order.createdAt)}
                      {' · '}
                      {order.status === 'paid' ? 'оплачен' : null}
                      {order.status === 'pending' ? 'ожидает оплаты' : null}
                      {order.status === 'abandoned' ? 'не завершён' : null}
                    </p>
                  </div>
                ))}
              </div>


            </section>
          ) : null}
        </>
      ) : error ? null : (
        <p className="text-muted">Загружаем…</p>
      )}
    </Page>
  );
}
