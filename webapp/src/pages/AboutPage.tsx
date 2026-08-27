import type { ReactElement } from 'react';
import { Page } from '../components/Layout';

export function AboutPage(): ReactElement {
  return (
    <Page>
      <article className="card reading">
        <h1>О нас</h1>
        <p>
          SchoolPiBoard — онлайн-доска для занятий: рисуйте, объясняйте и
          разбирайте задачи вместе, на одном холсте и в реальном времени,
          прямо в браузере.
        </p>
        <p>
          Сервис делает команда SchoolPi. ЗАГЛУШКА: развёрнутый рассказ о
          проекте и команде.
        </p>
      </article>
    </Page>
  );
}
