import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { MAIN_SITE } from '../content/company';
import { NoOrphans } from '../components/NoOrphans';
import {
  IconExternal, IconGuest, IconImage, IconPeople, IconTimer, IconViewer,
} from '../components/Icons';

interface Tile {
  icon: ReactElement;
  title: string;
  text: string;
}

const TILES: Tile[] = [
  {
    icon: <IconGuest size={26} />,
    title: 'Участнику не нужна регистрация',
    text: 'Он открывает присланную ссылку и называет имя — чтобы вы видели, чей курсор на доске. Ни аккаунта, ни установки. Платит только владелец доски.',
  },
  {
    icon: <IconImage size={26} />,
    title: 'Документы — на доску',
    text: 'PDF загружается в библиотеку один раз. Дальше нужные страницы вставляются на любую доску без повторной загрузки файла.',
  },
  {
    icon: <IconPeople size={26} />,
    title: 'Вы решаете, кто и что может',
    text: 'Пришедшего по ссылке видно в комнате ожидания. Вы впускаете нужного и даёте роль: рисовать или только смотреть.',
  },
  {
    icon: <IconTimer size={26} />,
    title: 'Таймер, клетка, линейка',
    text: 'Таймер на самостоятельную работу, разметка на фоне доски, конспект — картинкой на почту участнику.',
  },
  {
    icon: <IconViewer size={26} />,
    title: 'Работа не прерывается из-за связи',
    text: 'Связь пропала на минуту — доска догонит пропущенное, когда она вернётся. Одновременно на ней может быть до двадцати человек.',
  },
];

/**
 * Главная.
 *
 * Пишется для того, кто заводит доску и зовёт на неё участников: ни у
 * кого из них нет ни времени на настройку, ни желания регистрироваться
 * ради одной встречи. Каждый пункт объясняет, что именно происходит и
 * почему сделано так, а не перечисляет эпитеты.
 */
export function LandingPage(): ReactElement {
  const { user } = useAuth();

  return (
    <Page>
      <NoOrphans>
      <section className="card hero">
        <h1>Доска для совместной работы в браузере</h1>
        <p className="reading hero__lead">
          Пишете пером, вставляете документы и работаете с кем угодно в
          реальном времени. Участнику достаточно открыть присланную ссылку —
          ни регистрации, ни установки.
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
          Бесплатный тариф без срока и без карты. Первые семь дней — тариф «Стандартный».
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
          <h2 className="card-title">{MAIN_SITE.label}</h2>
          <p>Настольная версия доски для совместной работы за одним компьютером, без браузера и подписки.</p>
        </div>
        <a className="btn btn-primary" href={MAIN_SITE.url} target="_blank" rel="noopener noreferrer">
          Перейти на <span className="no-wrap">school-pi.online</span><IconExternal size={16} />
        </a>
      </section>

      <section className="card">
        <h2 className="card-title">Как начать</h2>
        <ol className="steps">
          <li>Зарегистрируйтесь и подтвердите почту — одна минута.</li>
          <li>Создайте доску: ссылка появится сразу.</li>
          <li>Отправьте её участнику и впустите его.</li>
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
      </NoOrphans>
    </Page>
  );
}
