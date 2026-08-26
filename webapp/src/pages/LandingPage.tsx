import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { BookshelfBackground } from '../components/BookshelfBackground';
import { Page } from '../components/Layout';

export function LandingPage(): ReactElement {
  return (
    <Page wide>
      <BookshelfBackground />

      <section className="hero">
        <h1>Доска для занятий в браузере</h1>
        <p className="lead">
          Откройте доску, дайте ссылку — и объясняйте, рисуйте и разбирайте
          задачи вместе, на одном холсте и в реальном времени.
        </p>

        <div className="row">
          <Link className="button large" to="/register">ЗАРЕГИСТРИРОВАТЬСЯ</Link>
          <Link className="button large ghost" to="/login">ВОЙТИ</Link>
        </div>
      </section>

      <section className="cards">
        <article className="card">
          <h2>Преподавателю</h2>
          <p>
            Создавайте доски, выпускайте на них ссылки с нужной ролью —
            рисовать или только смотреть. Ссылку можно отозвать и выпустить
            заново, а доску закрыть для новых участников.
          </p>
        </article>

        <article className="card">
          <h2>Обучающемуся</h2>
          <p>
            Регистрация не нужна. Достаточно перейти по ссылке и назвать имя —
            чтобы остальные понимали, чей курсор на доске.
          </p>
        </article>

        <article className="card">
          <h2>Перо и планшет</h2>
          <p>
            Доска рассчитана на перо: линия слушается нажима, ладонь на
            экране следа не оставляет, а пальцем двигается сам холст.
          </p>
        </article>
      </section>

      <section className="card">
        <h2>Как это работает</h2>
        <ol>
          <li>Зарегистрируйтесь и подтвердите почту.</li>
          <li>Возьмите семь дней бесплатно, без привязки карты.</li>
          <li>Создайте доску и отправьте ссылку тем, кого ждёте на занятии.</li>
          <li>Работайте вместе: до двадцати человек на одной доске.</li>
        </ol>
        <p className="muted small">
          Платит только тот, кто создаёт доски. Тем, кто приходит по ссылке,
          подписка не нужна.
        </p>
      </section>
    </Page>
  );
}
