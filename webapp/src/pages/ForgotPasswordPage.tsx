import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Page } from '../components/Layout';

export function ForgotPasswordPage(): ReactElement {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      const result = await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setSent(result.message);
    } catch {
      // Ответ намеренно одинаков и при неизвестном адресе: иначе форма
      // превратилась бы в способ узнать, кто здесь зарегистрирован.
      setSent('Если такая почта зарегистрирована, письмо отправлено.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      {sent ? (
        <div className="card form">
          <h1>Проверьте почту</h1>
          <p>{sent}</p>
          <Link className="button" to="/login">На страницу входа</Link>
        </div>
      ) : (
        <form className="card form" onSubmit={submit}>
          <h1>Восстановление пароля</h1>
          <p className="muted">Пришлём ссылку, по которой можно задать новый пароль.</p>

          <label htmlFor="email">Почта</label>
          <input id="email" type="email" required autoComplete="email"
                 value={email} onChange={(event) => setEmail(event.target.value)} />

          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Отправляем…' : 'Прислать ссылку'}
          </button>

          <p className="muted small"><Link to="/login">Вернуться ко входу</Link></p>
        </form>
      )}
    </Page>
  );
}
