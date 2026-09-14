import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { COMPANY, HAS_COMPANY_DETAILS, MAIN_SITE } from '../content/company';
import { IconExternal } from '../components/Icons';

/**
 * О сервисе и контакты.
 *
 * Здесь же реквизиты: покупателю нужно видеть, с кем он имеет дело, а
 * платёжной системе — что продавец назван.
 */
export function AboutPage(): ReactElement {
  return (
    <Page>
      <article className="card reading">
        <h1>О сервисе</h1>
        <p>
          SchoolPiBoard — замена бумаги и маркерной доски в совместной
          работе: пишите пером, вставляйте документы, объясняйте, а участник
          просто открывает ссылку и работает рядом.
        </p>
        <p>
          Поэтому участнику не нужна учётная запись, а ладонь на планшете не
          оставляет следа — иначе пером не пишут. Платит только владелец
          доски, и только за себя.
        </p>
        <p>
          Онлайн-доска продолжает настольную программу SchoolPiBoard из{' '}
          <a href={MAIN_SITE.url} target="_blank" rel="noopener noreferrer">
            {MAIN_SITE.label}<IconExternal size={14} />
          </a>{' '}
          — то же самое для работы на расстоянии.
        </p>
      </article>

      <article className="card reading">
        <h2 className="card-title">Контакты</h2>

        {HAS_COMPANY_DETAILS ? (
          <>
            <p>
              По вопросам работы сервиса, оплаты и возвратов пишите на{' '}
              <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. Отвечаем в
              течение {COMPANY.replyDays} рабочих дней.
            </p>
            <p className="text-muted small">
              {COMPANY.name}, {COMPANY.status}, ИНН {COMPANY.inn}.
            </p>
          </>
        ) : (
          <p className="text-muted">ЗАГЛУШКА: контакты и реквизиты продавца.</p>
        )}

        <p className="text-muted small">
          <Link to="/legal/terms">Пользовательское соглашение</Link>
          {' · '}
          <Link to="/legal/offer">Оферта</Link>
          {' · '}
          <Link to="/legal/privacy">Персональные данные</Link>
          {' · '}
          <Link to="/legal/consent">Согласие на обработку</Link>
        </p>
      </article>
    </Page>
  );
}
