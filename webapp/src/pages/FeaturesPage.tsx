import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { NoOrphans } from '../components/NoOrphans';

interface Block {
  title: string;
  items: string[];
}

/**
 * Возможности — коротко, по делу, для тех, кто уже присматривается.
 *
 * Пунктами, а не рассказом: сюда приходят сравнивать. Каждый пункт — одна
 * строка, самое важное; за подробностями — в справку или на пробу.
 */
const BLOCKS: Block[] = [
  {
    title: 'Рисование',
    items: [
      'Три пера с чувствительностью к нажиму, маркер, точечный ластик.',
      'Фигуры: линия, стрелка, прямоугольник, эллипс, треугольник и другие.',
      'Надписи на холсте, слои, отмена и повтор действия.',
    ],
  },
  {
    title: 'Материалы',
    items: [
      'Библиотека: PDF и картинки загружаются один раз, вставляются на любую доску.',
      'Выбор нужных страниц миниатюрами, обрезка примера рамкой.',
      'Вставка из буфера обмена и перетаскивание файла на холст.',
      'Конспект — картинкой на почту участнику.',
    ],
  },
  {
    title: 'Совместная работа',
    items: [
      'Участник заходит по ссылке без регистрации, называет имя.',
      'Комната ожидания: впускаете нужного и назначаете роль.',
      'Роли «рисует» и «только смотрит» — без обхода запрета.',
      'Курсоры участников подписаны именами и цветом.',
    ],
  },
  {
    title: 'Холст',
    items: [
      'Бесконечное полотно, масштаб от 2 % до 2000 %.',
      'Фон: клетка, линейка, точки, ромб или чистый лист.',
      'Таймер на самостоятельную работу.',
      'Всё сохраняется само — обрыв связи ничего не стирает.',
    ],
  },
  {
    title: 'Устройства',
    items: [
      'Работает в браузере — ставить нечего ни вам, ни участнику.',
      'Планшет с пером, компьютер, телефон — везде одинаково.',
      'Светлая и тёмная тема.',
    ],
  },
];

export function FeaturesPage(): ReactElement {
  return (
    <Page>
      <NoOrphans>
      <section className="card">
        <h1>Возможности</h1>
        <p className="reading">
          На доске рисуют от руки и работают с документами, а не расставляют
          карточки и стикеры.
        </p>
      </section>

      <div className="feature-blocks">
        {BLOCKS.map((block) => (
          <article className="card feature-block" key={block.title}>
            <h2 className="card-title">{block.title}</h2>
            <ul className="reading">
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>

      <section className="card" style={{ textAlign: 'center' }}>
        <h2 className="card-title">Попробовать ничего не стоит</h2>
        <p className="reading" style={{ margin: '0 auto var(--sp-4)' }}>
          Бесплатный тариф без срока, а первые семь дней открыт «Стандартный»
          целиком — с библиотекой документов.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary btn-lg" to="/register">Начать бесплатно</Link>
          <Link className="btn btn-outline btn-lg" to="/pricing">Тарифы</Link>
        </div>
      </section>
      </NoOrphans>
    </Page>
  );
}
