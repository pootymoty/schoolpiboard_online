import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { MAIN_SITE } from '../content/company';
import {
  IconEditor, IconExternal, IconGuest, IconImage, IconPeople, IconTimer, IconViewer,
} from '../components/Icons';

interface Tile {
  icon: ReactElement;
  title: string;
  text: string;
}

const TILES: Tile[] = [
  {
    icon: <IconGuest />,
    title: 'Ученику — без регистрации',
    text: 'Ссылка, имя — и он на доске. Платите только вы, и только за себя.',
  },
  {
    icon: <IconEditor />,
    title: 'Перо, а не мышь',
    text: 'Линия слушается нажима, ладонь на экране следа не оставляет.',
  },
  {
    icon: <IconImage />,
    title: 'Учебник — на холст',
    text: 'Загрузили PDF — вставляете нужные страницы в любое занятие.',
  },
  {
    icon: <IconPeople />,
    title: 'Вы решаете, кто и что может',
    text: 'Комната ожидания, роли «рисует» и «только смотрит».',
  },
  {
    icon: <IconTimer />,
    title: 'Мелочи по делу',
    text: 'Таймер, клетка и линейка, конспект занятия — на почту.',
  },
  {
    icon: <IconViewer />,
    title: 'Занятие не рвётся',
    text: 'Связь пропала — доска догонит. До 20 человек одновременно.',
  },
];

/**
 * Главная.
 *
 * Пишется для репетитора, который ведёт занятия от одного до пяти
 * человек: у него нет ни времени на настройку, ни желания заставлять
 * учеников регистрироваться. Первый экран продаёт за пять секунд —
 * обещание и кнопка, — а не перечисляет возможности.
 */
export function LandingPage(): ReactElement {
  const { user } = useAuth();

  return (
    <Page>
      <section className="card hero">
        <p className="eyebrow">Онлайн-доска для занятий</p>
        <h1>Доска для занятий, а не для совещаний</h1>
        <p className="reading hero__lead">
          Пишите пером, разбирайте задачи, вставляйте страницы учебника —
          прямо как на бумаге. Ученик заходит по ссылке за секунду, без
          установки и регистрации.
        </p>

        <div className="row hero__actions">
          {user ? (
            <Link className="btn btn-primary btn-lg" to="/boards">Мои доски</Link>
          ) : (
            <>
              <Link className="btn btn-primary btn-lg" to="/register">Начать бесплатно</Link>
              <Link className="btn btn-outline btn-lg" to="/pricing">Тарифы</Link>
            </>
          )}
        </div>

        <ul className="stat-row">
          <li>Ученику — бесплатно и навсегда</li>
          <li>7 дней «Стандартного» без карты</li>
          <li>До 20 человек на доске</li>
        </ul>
      </section>

      <div className="feature-grid">
        {TILES.map((tile) => (
          <article className="feature-tile" key={tile.title}>
            <span className="feature-tile__icon">{tile.icon}</span>
            <h3>{tile.title}</h3>
            <p>{tile.text}</p>
          </article>
        ))}
      </div>

      <section className="card brand-strip">
        <div>
          <h2 className="card-title">Часть «Школы Пи»</h2>
          <p>Здесь же — настольная доска для занятий за одним компьютером и другие продукты того же автора.</p>
        </div>
        <a className="btn btn-primary" href={MAIN_SITE.url} target="_blank" rel="noopener noreferrer">
          Открыть {MAIN_SITE.label}<IconExternal size={16} />
        </a>
      </section>

      <section className="card">
        <h2 className="card-title">Как начать</h2>
        <ol className="reading">
          <li>Зарегистрируйтесь и подтвердите почту — одна минута.</li>
          <li>Создайте доску: ссылка появится сразу.</li>
          <li>Отправьте её ученику перед занятием и впустите его.</li>
        </ol>

        <div className="row">
          {user ? (
            <Link className="btn btn-primary" to="/boards">Перейти к доскам</Link>
          ) : (
            <Link className="btn btn-primary" to="/register">Создать первую доску</Link>
          )}
          <Link className="btn btn-quiet" to="/faq">Частые вопросы</Link>
        </div>
      </section>
    </Page>
  );
}
