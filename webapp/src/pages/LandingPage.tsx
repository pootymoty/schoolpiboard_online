import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { IconEditor, IconGuest, IconViewer } from '../components/Icons';

export function LandingPage(): ReactElement {
  return (
    <Page>
      <section className="card" style={{ textAlign: 'center' }}>
        <h1>Доска для занятий в браузере</h1>
        <p className="reading" style={{ margin: '0 auto var(--sp-5)' }}>
          Откройте доску, дайте ссылку — и объясняйте, рисуйте и разбирайте
          задачи вместе, на одном холсте и в реальном времени.
        </p>

        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn-primary btn-lg" to="/register">Зарегистрироваться</Link>
          <Link className="btn-outline btn-lg" to="/login">Войти</Link>
        </div>
      </section>

      <div className="stack">
        <article className="card">
          <h2 className="card-title"><IconEditor /> Преподавателю</h2>
          <p>
            Создайте доску и отправьте ссылку. Кто по ней пришёл — виден
            в списке ожидающих: впустите нужных и задайте каждому роль.
            Ссылку можно перевыпустить, если она ушла не туда.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconGuest /> Обучающемуся</h2>
          <p>
            Регистрация не нужна. Достаточно перейти по ссылке и назвать
            имя — чтобы остальные понимали, чей курсор на доске.
          </p>
        </article>

        <article className="card">
          <h2 className="card-title"><IconViewer /> Перо и планшет</h2>
          <p>
            Доска рассчитана на перо: линия слушается нажима, ладонь на
            экране следа не оставляет, а пальцем двигается сам холст.
          </p>
        </article>
      </div>

      <section className="card">
        <h2 className="card-title">Как это работает</h2>
        <ol className="reading">
          <li>Зарегистрируйтесь и подтвердите почту.</li>
          <li>Возьмите семь дней бесплатно, без привязки карты.</li>
          <li>Создайте доску и отправьте ссылку тем, кого ждёте на занятии.</li>
          <li>Впустите пришедших и работайте вместе — до двадцати человек.</li>
        </ol>
        <p className="note note-info">
          Платит только тот, кто создаёт доски. Тем, кто приходит по ссылке,
          подписка не нужна.
        </p>
      </section>
    </Page>
  );
}
