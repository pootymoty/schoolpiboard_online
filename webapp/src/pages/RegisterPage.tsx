import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { RegisterResponse } from '../api/types';
import { Page } from '../components/Layout';

const MIN_PASSWORD_LENGTH = 8;

export function RegisterPage(): ReactElement {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const result = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: { displayName, email, password, passwordConfirm },
      });

      // Пользоваться учётной записью нельзя до перехода по ссылке из письма,
      // поэтому на страницу входа не уводим — человек всё равно не войдёт.
      setDone(result.message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось зарегистрироваться.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Page>
        <div className="card">
          <h1>Проверьте почту</h1>
          <p>{done}</p>
          <p className="text-muted small">
            Письмо не пришло? Загляните в «Спам», а затем запросите его заново на странице входа.
          </p>
          <Link className="btn-primary" to="/login">На страницу входа</Link>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <form className="card" onSubmit={submit}>
        <h1>Регистрация</h1>
        <p className="text-muted">
          Учётная запись нужна преподавателю — тому, кто создаёт доски.
          Обучающемуся регистрироваться не нужно: он заходит по ссылке.
        </p>

        <label htmlFor="displayName">Как вас называть</label>
        <input id="displayName" type="text" required maxLength={100} autoComplete="name"
               placeholder="Имя, которое увидят на доске"
               value={displayName} onChange={(event) => setDisplayName(event.target.value)} />

        <label htmlFor="email">Почта</label>
        <input id="email" type="email" required autoComplete="email"
               value={email} onChange={(event) => setEmail(event.target.value)} />

        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password"
               value={password} onChange={(event) => setPassword(event.target.value)} />

        <label htmlFor="passwordConfirm">Пароль ещё раз</label>
        <input id="passwordConfirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password"
               value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />

        {error ? <p className="note note-danger">{error}</p> : null}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Отправляем…' : 'Зарегистрироваться'}
        </button>

        <p className="text-muted small">
          Уже есть учётная запись? <Link to="/login">Войти</Link>
        </p>
      </form>
    </Page>
  );
}
