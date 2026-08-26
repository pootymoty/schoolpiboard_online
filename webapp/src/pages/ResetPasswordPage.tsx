import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

const MIN_PASSWORD_LENGTH = 8;

/** Страница из письма: задать новый пароль. */
export function ResetPasswordPage(): ReactElement {
  const [params] = useSearchParams();
  const { accept } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = params.get('token');

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
      return;
    }

    if (password !== passwordConfirm) {
      setError('Пароли не совпадают.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await api<AuthResponse>('/auth/reset-password', {
        method: 'POST',
        body: { token, password, passwordConfirm },
      });

      accept(result);
      navigate('/boards', { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сменить пароль.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Page narrow>
        <div className="card">
          <h1>Новый пароль</h1>
          <p className="note note-danger">Ссылка неполная. Откройте её из письма целиком.</p>
          <Link className="btn btn-primary" to="/forgot-password">Запросить ссылку заново</Link>
        </div>
      </Page>
    );
  }

  return (
    <Page narrow>
      <form className="card" onSubmit={submit}>
        <h1>Новый пароль</h1>

        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password"
               value={password} onChange={(event) => setPassword(event.target.value)} />

        <label htmlFor="passwordConfirm">Пароль ещё раз</label>
        <input id="passwordConfirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password"
               value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />

        {error ? <p className="note note-danger">{error}</p> : null}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Задать пароль'}
        </button>
      </form>
    </Page>
  );
}
