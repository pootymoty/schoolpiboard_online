import { useState } from 'react';
import type { ReactElement } from 'react';
import { ApiError } from '../api/client';
import { startSchoolPi } from '../auth/schoolPi';

/** Кнопка «Войти через Школу π» — на страницах входа и регистрации. */
export function SchoolPiButton({ label = 'Войти через Школу π' }: { label?: string }): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);

    try {
      await startSchoolPi('login');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перейти в Школу π.');
      setBusy(false);
    }
  };

  return (
    <div className="schoolpi-login">
      <button className="btn-outline schoolpi-login__button" type="button" onClick={go} disabled={busy}>
        <span className="schoolpi-login__mark" aria-hidden="true">π</span>
        {busy ? 'Переходим…' : label}
      </button>
      {error ? <p className="note note-danger">{error}</p> : null}
      <div className="schoolpi-login__or"><span>или</span></div>
    </div>
  );
}
