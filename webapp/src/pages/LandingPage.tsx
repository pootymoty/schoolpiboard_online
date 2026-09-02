import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { IconEditor, IconGuest, IconImage, IconPeople, IconTimer, IconViewer } from '../components/Icons';

/**
 * Главная.
 *
 * Пишется для репетитора, который ведёт занятия от одного до пяти
 * человек: у него нет ни времени на настройку, ни желания заставлять
 * учеников регистрироваться. Поэтому первым делом — что он получит и
 * почему это ничего не стоит его ученикам, а не список возможностей.
 */
export function LandingPage(): ReactElement {
  const { user } = useAuth();

  return (
    <Page>
      <section className="card hero">
        <h1>Онлайн-доска для репетитора</h1>
        <p className="reading hero__lead">
          Объясняйте на доске, как на бумаге: пишите пером, разбирайте задачи,
          вставляйте страницы учебника. Ученик заходит по ссылке — без
          регистрации, установки и лишних вопросов.
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

      <div className="stack">
        <article className="card">
          <h2 className="card-title"><IconGuest /> Ученику не нужна регистрация</h2>
          <p>
            Вы отправляете ссылку, ученик открывает её и называет имя — чтобы вы
            видели, чей курсор на доске. Ни учётной записи, ни установки, ни оплаты:
            платит только преподаватель, и только за себя.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconEditor /> Перо, а не мышь</h2>
          <p>
            Доска рассчитана на планшет с пером: линия слушается нажима, ладонь на
            экране следа не оставляет, а пальцем двигается сам холст. Три пера с
            разными настройками, маркер и ластик, который стирает задетое, а не
            весь штрих целиком.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconImage /> Учебник — прямо на доску</h2>
          <p>
            Загрузите PDF, выберите нужные страницы и вставьте их на холст. Можно
            обрезать рамкой один пример и разобрать его крупно. Загруженное
            остаётся в вашей библиотеке: второй раз тот же учебник загружать не
            придётся.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconPeople /> Вы решаете, кто и что может</h2>
          <p>
            Пришедшего по ссылке видно в списке ожидающих: впустите нужного и
            задайте роль — работать на доске или только смотреть. Ссылку можно
            перевыпустить, если она ушла не туда, а доску — закрыть для новых.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconTimer /> Мелочи, которые экономят занятие</h2>
          <p>
            Таймер на самостоятельную работу, сохранение доски картинкой на память
            ученику, разлиновка в клетку и линейку, вставка из буфера обмена.
            Всё, что нарисовано, сохраняется само — доска не пропадёт, если
            закрыть вкладку.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconViewer /> Занятие не рвётся</h2>
          <p>
            Связь пропала на минуту — нарисованное не потеряется: доска догонит
            пропущенное, когда сеть вернётся. До двадцати человек одновременно,
            если ведёте не одного, а группу.
          </p>
        </article>
      </div>

      <section className="card">
        <h2 className="card-title">Как начать</h2>
        <ol className="reading">
          <li>Зарегистрируйтесь и подтвердите почту — это одна минута.</li>
          <li>Создайте доску: ссылка на неё появится сразу.</li>
          <li>Отправьте ссылку ученику перед занятием.</li>
          <li>Впустите его и работайте вместе.</li>
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
