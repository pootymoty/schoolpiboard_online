import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { COMPANY, HAS_COMPANY_DETAILS } from '../content/company';

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
          SchoolPiBoard — онлайн-доска для занятий. Её делали не как ещё одну
          доску для совещаний, а как замену тетради и маркерной доски на уроке:
          чтобы преподаватель писал пером, разбирал задачи по учебнику и
          объяснял, а ученик просто открывал ссылку и работал рядом.
        </p>
        <p>
          Отсюда и решения, которые в других досках выглядят странно. Ученику не
          нужна учётная запись — регистрация в начале каждого занятия отнимает
          время у обоих. Платит только преподаватель, и только за себя. Ладонь,
          лежащая на планшете, не оставляет следа, потому что иначе пером не
          пишут.
        </p>
        <p>
          Сервис продолжает настольную программу SchoolPiBoard — ту же доску, но
          для занятий за одним компьютером. Онлайн-версия делает то же самое для
          занятий на расстоянии.
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
        </p>
      </article>
    </Page>
  );
}
