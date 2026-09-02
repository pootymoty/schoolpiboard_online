import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Page } from '../components/Layout';
import { humanSize } from '../api/files';
import type { MyPlan } from '../api/types';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MyPlan>('/billing/me')
      .then(setMine)
      .catch((reason) => setError(
        reason instanceof ApiError ? reason.message : 'Не удалось загрузить тариф.',
      ));
  }, []);

  const until = mine?.until
    ? new Date(mine.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <Page narrow>
      <div className="page-header">
        <h1>Мой тариф</h1>
      </div>

      {error ? <p className="note note-danger">{error}</p> : null}

      {mine ? (
        <>
          <section className="card">
            <h2 className="card-title">{mine.plan.name}</h2>

            {mine.kind === 'trial' && until ? (
              <p className="note note-info">
                Пробный период до {until}. Дальше аккаунт вернётся к бесплатным пределам —
                ничего не пропадёт.
              </p>
            ) : null}

            {mine.kind === 'paid' && until ? (
              <p className="text-muted">Оплачено до {until}.</p>
            ) : null}

            {mine.kind === 'free' ? (
              <p className="text-muted">
                Бесплатный тариф — без срока. Платный расширяет пределы и открывает
                библиотеку документов.
              </p>
            ) : null}

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
                На доске одновременно — до {mine.plan.maxParticipants} человек, считая вас.
                Библиотека документов {mine.plan.hasLibrary ? 'доступна' : 'на платных тарифах'}.
              </p>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Сменить тариф</h2>
            <p className="text-muted">
              Оплата подключается — пока тариф меняем вручную. Напишите, и мы всё сделаем.
            </p>
            <Link className="btn btn-primary" to="/pricing">Посмотреть тарифы</Link>
          </section>
        </>
      ) : error ? null : (
        <p className="text-muted">Загружаем…</p>
      )}
    </Page>
  );
}
