import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, writeToken } from '../api/client';
import type { SchoolBonus, SchoolPiAuthResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { bonusText } from '../auth/schoolPi';
import { SchoolPiButton } from '../components/SchoolPiButton';
import { Page } from '../components/Layout';

type View =
  | { kind: 'working' }
  | { kind: 'done'; title: string; bonus: SchoolBonus | null; next: string; nextLabel: string }
  | { kind: 'confirm'; ticket: string; email: string }
  | { kind: 'error'; message: string };

function parseBonus(raw: string | null): SchoolBonus | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SchoolBonus;
  } catch {
    return null;
  }
}

/**
 * Возврат из «Школы π».
 *
 * Сервер после входа в школе переадресует сюда, а итог кладёт в часть
 * адреса после «#»: она не уходит ни на сервер, ни в логи. Отсюда же
 * открывается ссылка из письма о склейке (`?confirm=…`).
 */
export function SchoolPiPage(): ReactElement {
  const { accept, refresh } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: 'working' });

  // В строгом режиме эффект срабатывает дважды, а ссылка из письма —
  // одноразовая.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);

    // Токен в адресной строке не должен оставаться: ни в истории, ни в
    // закладке, ни на снимке экрана.
    window.history.replaceState(null, '', window.location.pathname);

    const mail = query.get('confirm');
    if (mail) {
      api<SchoolPiAuthResponse>('/auth/schoolpi/confirm-mail', { method: 'POST', body: { ticket: mail } })
        .then((result) => {
          accept(result);
          setView({ kind: 'done', title: 'Учётные записи связаны, вы вошли.', bonus: result.bonus, next: '/boards', nextLabel: 'К доскам' });
        })
        .catch((reason: unknown) => {
          setView({ kind: 'error', message: reason instanceof ApiError ? reason.message : 'Не удалось связать учётные записи.' });
        });
      return;
    }

    const result = hash.get('result');
    const bonus = parseBonus(hash.get('bonus'));

    if (result === 'signed_in' && hash.get('token')) {
      writeToken(hash.get('token'));
      refresh()
        .then(() => {
          // Без бонуса показывать нечего — сразу к доскам.
          if (!bonus) navigate('/boards', { replace: true });
          else setView({ kind: 'done', title: 'Вы вошли через Школу π.', bonus, next: '/boards', nextLabel: 'К доскам' });
        })
        .catch(() => setView({ kind: 'error', message: 'Не удалось войти. Попробуйте ещё раз.' }));
      return;
    }

    if (result === 'linked') {
      refresh()
        .catch(() => undefined)
        .finally(() => setView({ kind: 'done', title: 'Аккаунт Школы π привязан.', bonus, next: '/profile', nextLabel: 'В профиль' }));
      return;
    }

    if (result === 'confirm' && hash.get('ticket')) {
      setView({ kind: 'confirm', ticket: hash.get('ticket') ?? '', email: hash.get('email') ?? '' });
      return;
    }

    setView({ kind: 'error', message: hash.get('message') ?? 'Вход через Школу π не завершён. Попробуйте ещё раз.' });
  }, [accept, refresh, navigate]);

  return (
    <Page narrow>
      <div className="card">
        <h1>Вход через Школу π</h1>

        {view.kind === 'working' ? <p className="text-muted">Минуту…</p> : null}

        {view.kind === 'done' ? (
          <>
            <p>{view.title}</p>
            {view.bonus ? (
              <p className="note note-success">
                <strong>Подарок за вход через Школу π.</strong> {bonusText(view.bonus)}
              </p>
            ) : null}
            <Link className="btn btn-primary" to={view.next}>{view.nextLabel}</Link>
          </>
        ) : null}

        {view.kind === 'confirm' ? (
          <ConfirmLink
            ticket={view.ticket}
            email={view.email}
            onDone={(answer) => {
              accept(answer);
              setView({ kind: 'done', title: 'Учётные записи связаны, вы вошли.', bonus: answer.bonus, next: '/boards', nextLabel: 'К доскам' });
            }}
          />
        ) : null}

        {view.kind === 'error' ? (
          <>
            <p className="note note-danger">{view.message}</p>
            <SchoolPiButton label="Войти через Школу π ещё раз" divider={false} />
            <Link className="btn btn-quiet" to="/login">На страницу входа</Link>
          </>
        ) : null}
      </div>
    </Page>
  );
}

/**
 * На доске уже есть учётная запись с той же почтой. Связываем только
 * после доказательства, что она его: пароль от доски или письмо на неё.
 */
function ConfirmLink({ ticket, email, onDone }: {
  ticket: string;
  email: string;
  onDone: (answer: SchoolPiAuthResponse) => void;
}): ReactElement {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Записка о склейке больше не годится (вышло время, учётная запись
  // изменилась) — повторять ту же форму бессмысленно, нужен новый вход.
  const [stale, setStale] = useState(false);

  const fail = (reason: unknown, fallback: string) => {
    if (reason instanceof ApiError) {
      setError(reason.message);
      if (['expired', 'invalid', 'changed'].includes(reason.code)) setStale(true);
    } else {
      setError(fallback);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      onDone(await api<SchoolPiAuthResponse>('/auth/schoolpi/confirm-password', {
        method: 'POST',
        body: { ticket, password },
      }));
    } catch (reason) {
      fail(reason, 'Не удалось связать учётные записи.');
    } finally {
      setBusy(false);
    }
  };

  const sendMail = async () => {
    setBusy(true);
    setError(null);

    try {
      const answer = await api<{ message: string }>('/auth/schoolpi/send-confirmation', {
        method: 'POST',
        body: { ticket },
      });
      setSent(answer.message);
    } catch (reason) {
      fail(reason, 'Не удалось отправить письмо.');
    } finally {
      setBusy(false);
    }
  };

  if (stale) {
    return (
      <>
        <p className="note note-danger">{error}</p>
        <SchoolPiButton label="Войти через Школу π ещё раз" divider={false} />
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <p>
        На доске уже есть учётная запись с почтой <strong>{email}</strong>. Подтвердите, что она ваша, —
        и она будет связана с аккаунтом Школы π. Доски, подписка и всё остальное останутся на месте.
      </p>

      <label htmlFor="schoolpi-password">Пароль от доски</label>
      <input id="schoolpi-password" type="password" required autoComplete="current-password"
             value={password} onChange={(event) => setPassword(event.target.value)} />

      {error ? <p className="note note-danger">{error}</p> : null}
      {sent ? <p className="note note-success">{sent}</p> : null}

      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? 'Связываем…' : 'Связать и войти'}
      </button>

      <p className="text-muted small">Не помните пароль? Пришлём ссылку на {email}.</p>
      <button className="btn-quiet" type="button" onClick={sendMail} disabled={busy}>
        Прислать ссылку
      </button>
    </form>
  );
}
