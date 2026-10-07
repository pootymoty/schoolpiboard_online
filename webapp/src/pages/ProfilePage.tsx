import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, writeToken } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { startSchoolPi } from '../auth/schoolPi';
import { Page } from '../components/Layout';

/**
 * Профиль: имя, смена пароля, входы на других устройствах, удаление аккаунта.
 *
 * Пароль меняется через ту же ссылку на почту, что и восстановление —
 * отдельная форма с текущим паролем не добавила бы защиты, только лишний
 * экран: владение почтой и так подтверждает личность.
 */
export function ProfilePage(): ReactElement {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return <Page narrow>{null}</Page>;

  return (
    <Page narrow>
      <h1>Профиль</h1>

      <NameCard user={user} onSaved={refresh} />
      <SchoolPiCard linked={user.schoolPiLinked} />
      <PasswordCard email={user.email} />
      <SessionsCard />
      <DangerCard onDeleted={() => { logout(); navigate('/', { replace: true }); }} />
    </Page>
  );
}

function NameCard({ user, onSaved }: { user: User; onSaved: () => Promise<void> }): ReactElement {
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api('/auth/me', { method: 'PATCH', body: { displayName: name } });
      await onSaved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card-title">Имя</h2>
      <p className="text-muted small">Так вас видят на досках.</p>

      <div className="field">
        <label htmlFor="displayName">Имя</label>
        <input id="displayName" type="text" required maxLength={100}
               value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      {error ? <p className="note note-danger">{error}</p> : null}

      <button className="btn-primary" type="submit" disabled={busy || name.trim() === user.displayName}>
        {busy ? 'Сохраняем…' : saved ? 'Сохранено' : 'Сохранить'}
      </button>
    </form>
  );
}

function PasswordCard({ email }: { email: string }): ReactElement {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Пароль</h2>
      <p className="text-muted small">
        Пришлём на {email} ссылку для смены. После смены пароля входы на всех
        других устройствах завершатся.
      </p>

      {sent ? (
        <p className="note note-success">Письмо отправлено — проверьте почту.</p>
      ) : (
        <button className="btn-outline" type="button" onClick={request} disabled={busy}>
          {busy ? 'Отправляем…' : 'Сменить пароль'}
        </button>
      )}
    </div>
  );
}

/**
 * Выход на всех устройствах.
 *
 * Для случая «вошёл на чужом компьютере и забыл выйти» или «кажется,
 * вход увели»: все прочие входы перестают действовать сразу, а этот
 * браузер получает новый и остаётся внутри. Смена пароля по ссылке из
 * письма делает то же самое.
 */
/**
 * Аккаунт «Школы π». Нужен тем, у кого почта на доске и в школе разная:
 * сами учётные записи друг друга не найдут. Отвязки нет: бонус за
 * привязку выдаётся один раз, и отвязка с привязкой к другой учётной
 * записи была бы способом получать его снова.
 */
function SchoolPiCard({ linked }: { linked: boolean }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = async () => {
    setBusy(true);
    setError(null);

    try {
      await startSchoolPi('link');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перейти в Школу π.');
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Школа π</h2>

      {linked ? (
        <p className="text-muted small">
          Аккаунт Школы π привязан: входить можно и через него, и по почте с паролем.
          Если пароля у вас нет и он нужен — задайте его кнопкой «Сменить пароль» ниже.
        </p>
      ) : (
        <>
          <p className="text-muted small">
            Привяжите аккаунт Школы π — и входите на доску в одно касание. За привязку дарим
            неделю тарифа «Расширенный»; если сейчас действует тариф попроще, он встанет на паузу
            и продолжится после подарка.
          </p>

          {error ? <p className="note note-danger">{error}</p> : null}

          <button className="btn-outline" type="button" onClick={link} disabled={busy}>
            {busy ? 'Переходим…' : 'Привязать аккаунт Школы π'}
          </button>
        </>
      )}
    </div>
  );
}

function SessionsCard(): ReactElement {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!window.confirm('Выйти на всех остальных устройствах? Там придётся войти заново.')) return;

    setBusy(true);
    setError(null);

    try {
      const answer = await api<{ token: string }>('/auth/logout-all', { method: 'POST' });
      writeToken(answer.token);
      setDone(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось выйти на других устройствах.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Входы</h2>
      <p className="text-muted small">
        Вход сам заканчивается после 12 часов без действий и в любом случае через 30 дней.
        Если вы вошли на чужом устройстве и не вышли — завершите все входы, кроме этого.
      </p>

      {error ? <p className="note note-danger">{error}</p> : null}

      {done ? (
        <p className="note note-success">Готово: на всех других устройствах вход завершён.</p>
      ) : (
        <button className="btn-outline" type="button" onClick={revoke} disabled={busy}>
          {busy ? 'Завершаем…' : 'Выйти на всех устройствах'}
        </button>
      )}
    </div>
  );
}

/**
 * Удаление аккаунта — кодом из письма, а не паролем: письмо приходит
 * только хозяину почты, а пароль мог знать и кто-то ещё. И у тех, кто
 * входит через Школу π, пароля нет вовсе.
 */
function DangerCard({ onDeleted }: { onDeleted: () => void }): ReactElement {
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (!sent && !window.confirm('Удалить аккаунт? На почту придёт код для подтверждения.')) return;

    setBusy(true);
    setError(null);

    try {
      const answer = await api<{ message: string }>('/auth/me/delete-code', { method: 'POST' });
      setSent(answer.message);
      setCode('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отправить код.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm('Удалить аккаунт насовсем? Войти в него станет нельзя.')) return;

    setBusy(true);
    setError(null);

    try {
      await api('/auth/me', { method: 'DELETE', body: { code } });
      onDeleted();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить аккаунт.');
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Удаление аккаунта</h2>
      <p className="text-muted small">
        Войти станет нельзя. Почта освободится сразу, доски проработают
        у участников ещё полгода.
      </p>

      {sent ? (
        <form onSubmit={submit}>
          <p className="note note-success">{sent} Код действует 15 минут.</p>

          <div className="field">
            <label htmlFor="deleteCode">Код из письма</label>
            <input id="deleteCode" type="text" inputMode="numeric" autoComplete="one-time-code"
                   required pattern="[0-9]{6}" placeholder="000000"
                   value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>

          {error ? <p className="note note-danger">{error}</p> : null}

          <div className="row">
            <button className="btn-danger" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Удаляем…' : 'Удалить аккаунт насовсем'}
            </button>
            <button className="btn-quiet" type="button" onClick={requestCode} disabled={busy}>
              Прислать код ещё раз
            </button>
            <button className="btn-quiet" type="button" onClick={() => { setSent(null); setError(null); }} disabled={busy}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <>
          {error ? <p className="note note-danger">{error}</p> : null}
          <button className="btn-danger" type="button" onClick={requestCode} disabled={busy}>
            {busy ? 'Отправляем код…' : 'Удалить аккаунт'}
          </button>
        </>
      )}
    </div>
  );
}
