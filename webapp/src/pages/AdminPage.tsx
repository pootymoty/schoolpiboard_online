import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { adminOrders, adminStats, adminUsers } from '../api/admin';
import type { AdminOrder, AdminStats, AdminUser } from '../api/admin';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

/** Столько строк на странице. Больше не помещается на экран без прокрутки. */
const SIZE = 20;

/**
 * Пауза перед запросом при наборе.
 *
 * Без неё каждая буква уходит на сервер: «иванов» — это шесть запросов,
 * из которых нужен последний. Четверть секунды человек не замечает, а
 * лишние пять запросов не случаются.
 */
const TYPING_MS = 250;

function day(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
}

function Tile({ title, value }: { title: string; value: string }): ReactElement {
  return (
    <div className="admin__tile">
      <span className="admin__tile-value">{value}</span>
      <span className="admin__tile-title">{title}</span>
    </div>
  );
}

export function AdminPage(): ReactElement {
  const { user, loading } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Чьи покупки раскрыты и какие именно. */
  const [open, setOpen] = useState<number | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  const pending = useRef<AbortController | null>(null);

  const load = useCallback((search: string, at: number) => {
    // Предыдущий запрос отменяем: при быстром наборе ответы приходят не
    // в том порядке, в каком их спрашивали, и список мигал бы старым.
    pending.current?.abort();

    const control = new AbortController();
    pending.current = control;

    setBusy(true);

    adminUsers(search, at, SIZE, control.signal)
      .then((answer) => {
        setRows(answer.users);
        setTotal(answer.total);
        setError(null);
      })
      .catch((reason) => {
        if (control.signal.aborted) return;
        setError(reason instanceof ApiError ? reason.message : 'Не удалось прочитать список.');
      })
      .finally(() => {
        if (!control.signal.aborted) setBusy(false);
      });
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) return undefined;

    const timer = window.setTimeout(() => load(query, page), TYPING_MS);
    return () => window.clearTimeout(timer);
  }, [query, page, load, user?.isAdmin]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    adminStats().then(setStats).catch(() => undefined);
  }, [user?.isAdmin]);

  const show = (userId: number) => {
    if (open === userId) {
      setOpen(null);
      return;
    }

    setOpen(userId);
    setOrders([]);
    adminOrders(userId).then(setOrders).catch(() => setOrders([]));
  };

  if (loading) return <Page narrow><p className="text-muted">Загружаем…</p></Page>;

  // Не «нет доступа», а «нет такой страницы»: панель посторонним не
  // показывают даже отказом.
  if (!user?.isAdmin) return <Navigate to="/boards" replace />;

  const pages = Math.max(1, Math.ceil(total / SIZE));

  return (
    <Page>
      <div className="page-header">
        <h1>Администрирование</h1>
      </div>

      {error ? <p className="note note-danger">{error}</p> : null}

      {stats ? (
        <div className="admin__tiles">
          <Tile title="Учётных записей" value={String(stats.users)} />
          <Tile title="Почта подтверждена" value={String(stats.confirmed)} />
          <Tile title="Платных подписок" value={String(stats.active)} />
          <Tile title="Пробных" value={String(stats.trials)} />
          <Tile title="Досок" value={String(stats.boards)} />
          <Tile title="Покупок за 30 дней" value={String(stats.paidMonth)} />
          <Tile title="Выручка за 30 дней" value={`${stats.revenueMonth} ₽`} />
          <Tile title="Выручка всего" value={`${stats.revenueTotal} ₽`} />
          <Tile title="Счетов ждёт оплаты" value={String(stats.pending)} />
          <Tile title="Счетов брошено" value={String(stats.abandoned)} />
        </div>
      ) : null}

      <section className="card">
        <div className="admin__search">
          <input
            className="input"
            type="search"
            value={query}
            placeholder="Имя или почта"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <span className="text-muted small">
            {busy ? 'Ищем…' : `Найдено: ${total}`}
          </span>
        </div>

        <div className="table-scroll">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Кто</th>
                <th>Тариф</th>
                <th>До</th>
                <th>Досок</th>
                <th>Покупок</th>
                <th>Всего</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((one) => (
                <tr key={one.id} className={one.deletedAt ? 'admin__row--gone' : undefined}>
                  <td>
                    <span className="admin__who">
                      {one.displayName}
                      {one.isAdmin ? <span className="admin__mark">админ</span> : null}
                      {one.deletedAt ? <span className="admin__mark">удалён</span> : null}
                      {!one.emailConfirmed && !one.deletedAt
                        ? <span className="admin__mark">почта не подтверждена</span>
                        : null}
                    </span>
                    <span className="text-muted small">{one.email}</span>
                  </td>
                  <td>{one.planName}</td>
                  <td>
                    {day(one.until)}
                    {one.autoRenew ? <span className="admin__mark">продление</span> : null}
                  </td>
                  <td>{one.boards}</td>
                  <td>{one.paid}</td>
                  <td>{one.spent} ₽</td>
                  <td>
                    <button className="btn-quiet btn-sm" type="button" onClick={() => show(one.id)}>
                      {open === one.id ? 'Скрыть' : 'Покупки'}
                    </button>
                  </td>
                </tr>
              ))}

              {open !== null ? (
                <tr>
                  <td colSpan={7}>
                    {orders.length === 0 ? (
                      <p className="text-muted small" style={{ margin: 0 }}>Покупок нет.</p>
                    ) : (
                      <div className="stack">
                        {orders.map((order) => (
                          <p key={order.invoiceId} className="small" style={{ margin: 0 }}>
                            {day(order.createdAt)} · {order.planName}, {order.days} дн. — {order.amount} ₽
                            {' · '}
                            {order.status === 'paid' ? `оплачен ${day(order.paidAt)}` : 'не оплачен'}
                            {order.autoRenew ? ' · с продлением' : ''}
                            {' · счёт № '}{order.invoiceId}
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ) : null}

              {rows.length === 0 && !busy ? (
                <tr><td colSpan={7}><span className="text-muted">Никого не нашлось.</span></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div className="admin__pager">
            <button
              className="btn-quiet btn-sm"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Назад
            </button>

            <span className="text-muted small">{page} из {pages}</span>

            <button
              className="btn-quiet btn-sm"
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </section>
    </Page>
  );
}
