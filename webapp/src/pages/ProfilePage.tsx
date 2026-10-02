import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, writeToken } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
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
      <p className="text-muted small">Пришлём на {email} ссылку для смены.</p>

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

function DangerCard({ onDeleted }: { onDeleted: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm('Удалить аккаунт? Войти в него станет нельзя.')) return;

    setBusy(true);
    setError(null);

    try {
      await api('/auth/me', { method: 'DELETE', body: { password } });
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

      {open ? (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="deletePassword">Подтвердите паролем</label>
            <input id="deletePassword" type="password" required autoComplete="current-password"
                   value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>

          {error ? <p className="note note-danger">{error}</p> : null}

          <div className="row">
            <button className="btn-danger" type="submit" disabled={busy}>
              {busy ? 'Удаляем…' : 'Удалить аккаунт насовсем'}
            </button>
            <button className="btn-quiet" type="button" onClick={() => setOpen(false)} disabled={busy}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-danger" type="button" onClick={() => setOpen(true)}>
          Удалить аккаунт
        </button>
      )}
    </div>
  );
}
