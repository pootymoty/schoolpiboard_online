import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { BookshelfBackground } from '../components/BookshelfBackground';
import { Footer, Header } from '../components/Layout';

/**
 * Главная страница. Единственная, где есть фон с книжными полками —
 * на остальных страницах он только мешал бы работать.
 *
 * Структура собрана вручную, а не через общий Page: фон спозиционирован
 * фиксированно и потому рисуется поверх обычных блоков. Контент выносит
 * над ним обёртка .landing-content со своим z-index — без неё фон
 * закрывает страницу целиком.
 */
export function LandingPage(): ReactElement {
  return (
    <div className="site landing">
      <BookshelfBackground />

      <div className="landing-content">
        <Header />

        <main className="main">
          <section className="hero">
            <h1 className="hero-title">Доска для занятий в браузере</h1>
            <p className="hero-lead">
              Откройте доску, дайте ссылку — и объясняйте, рисуйте и разбирайте
              задачи вместе, на одном холсте и в реальном времени.
            </p>

            <div className="hero-actions">
              <Link className="button hero-button" to="/register">ЗАРЕГИСТРИРОВАТЬСЯ</Link>
              <Link className="button hero-button ghost" to="/login">ВОЙТИ</Link>
            </div>
          </section>

          <section className="cards">
            <article className="card">
              <h2>Преподавателю</h2>
              <p>
                Создавайте доски и выпускайте на них ссылки с нужной ролью —
                рисовать или только смотреть. Ссылку можно отозвать и выпустить
                заново, а доску закрыть для новых участников.
              </p>
            </article>

            <article className="card">
              <h2>Обучающемуся</h2>
              <p>
                Регистрация не нужна. Достаточно перейти по ссылке и назвать
                имя — чтобы остальные понимали, чей курсор на доске.
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

          <section className="section-card">
            <h2>Как это работает</h2>
            <ol className="steps">
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
        </main>

        <Footer />
      </div>
    </div>
  );
}
