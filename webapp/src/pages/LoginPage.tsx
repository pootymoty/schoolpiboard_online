import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/Layout';

export function LoginPage(): ReactElement {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Почта не подтверждена — предлагаем выслать письмо заново прямо здесь,
  // а не отправляем человека искать, где это делается.
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const next = params.get('next');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setNeedsConfirmation(false);

    try {
      await login(email, password);
      navigate(next ?? '/boards');
    } catch (reason) {
      if (reason instanceof ApiError) {
        setError(reason.message);
        if (reason.code === 'email_not_confirmed') setNeedsConfirmation(true);
      } else {
        setError('Не удалось войти.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const result = await api<{ message: string }>('/auth/resend-confirmation', {
        method: 'POST',
        body: { email },
      });
      setError(null);
      setNeedsConfirmation(false);
      setNotice(result.message);
    } catch {
      setError('Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page narrow>
      <form className="card" onSubmit={submit}>
        <h1>Вход</h1>

        <label htmlFor="email">Почта</label>
        <input id="email" type="email" required autoComplete="email"
               value={email} onChange={(event) => setEmail(event.target.value)} />

        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" required autoComplete="current-password"
               value={password} onChange={(event) => setPassword(event.target.value)} />

        {error ? <p className="note note-danger">{error}</p> : null}
        {notice ? <p className="text-muted">{notice}</p> : null}

        {needsConfirmation ? (
          <button className="btn-quiet" type="button" onClick={resend} disabled={busy}>
            Выслать письмо ещё раз
          </button>
        ) : null}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>

        <p className="text-muted small">
          <Link to="/forgot-password">Забыли пароль?</Link>
        </p>
        <p className="text-muted small">
          Нет учётной записи? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </Page>
  );
}
