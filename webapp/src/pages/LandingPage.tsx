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
    title: 'Ученику не нужна регистрация',
    text: 'Вы присылаете ссылку, он называет имя — чтобы вы видели, чей курсор на доске — и всё. Платите только вы, и только за себя.',
  },
  {
    icon: <IconEditor />,
    title: 'Перо, а не мышь',
    text: 'Линия толще там, где сильнее нажали, а ладонь на экране следа не оставляет — иначе на планшете просто не пишут.',
  },
  {
    icon: <IconImage />,
    title: 'Учебник — на доску',
    text: 'Загруженный PDF остаётся в библиотеке: страницы вставляете заново на каждом занятии, а файл пересылать не нужно.',
  },
  {
    icon: <IconPeople />,
    title: 'Вы решаете, кто и что может',
    text: 'Пришедшего по ссылке видно в комнате ожидания. Впускаете нужного и даёте роль — рисовать или только смотреть.',
  },
  {
    icon: <IconTimer />,
    title: 'Мелочи, которые экономят занятие',
    text: 'Таймер на самостоятельную работу, клетка и линейка на фоне, конспект занятия — картинкой на почту ученику.',
  },
  {
    icon: <IconViewer />,
    title: 'Занятие не рвётся из-за связи',
    text: 'Пропала на минуту — доска досчитает пропущенное, когда она вернётся. Одновременно на ней может быть до двадцати человек.',
  },
];

/**
 * Главная.
 *
 * Пишется для репетитора, который ведёт занятия от одного до пяти
 * человек: у него нет ни времени на настройку, ни желания заставлять
 * учеников регистрироваться. Каждый пункт объясняет, что именно
 * происходит и почему сделано так, а не перечисляет эпитеты.
 */
export function LandingPage(): ReactElement {
  const { user } = useAuth();

  return (
    <Page>
      <section className="card hero">
        <h1>Доска для занятий, а не для совещаний</h1>
        <p className="reading hero__lead">
          Пишете пером, разбираете задачи, вставляете страницы учебника — как
          на бумаге. Ученику для этого ничего не ставить: он открывает
          присланную ссылку и через пару секунд уже рядом с вами на доске.
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

        <p className="text-muted small hero__note">
          Бесплатный тариф без срока и без карты. Первые семь дней — «Стандартный»,
          чтобы попробовать всё.
        </p>
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
          <p>Тот же автор делает настольную доску для занятий за одним компьютером — на {MAIN_SITE.label}.</p>
        </div>
        <a className="btn btn-primary" href={MAIN_SITE.url} target="_blank" rel="noopener noreferrer">
          Перейти на school-pi.online<IconExternal size={16} />
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
