import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { LEGAL } from '../content/legal';
import type { Block, LegalDocument } from '../content/legal';

/**
 * Правовые документы: оферта, соглашение, политика.
 *
 * Страница только раскладывает текст по разделам — сам текст лежит в
 * `content/legal.ts`. Правят его по юридическому поводу, и смешивать это
 * с вёрсткой не стоит: тогда каждая правка договора превращается в правку
 * компонента.
 */
function Piece({ block }: { block: Block }): ReactElement {
  if (block.kind === 'p') return <p>{block.text}</p>;

  if (block.kind === 'list') {
    return (
      <ul>
        {block.items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    );
  }

  return (
    <div className="table-scroll">
      <table className="legal__table">
        <caption>{block.caption}</caption>
        <tbody>
          {block.rows.map(([name, value]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage(): ReactElement {
  const { page } = useParams<{ page: string }>();
  const document: LegalDocument = LEGAL[page ?? ''] ?? LEGAL.terms;

  return (
    <Page>
      <article className="card reading legal">
        <h1>{document.title}</h1>

        {document.lead ? <p className="text-muted">{document.lead}</p> : null}

        {document.sections.map((section) => (
          <section key={section.title}>
            <h2 className="legal__title">{section.title}</h2>
            {section.blocks.map((block, index) => <Piece key={index} block={block} />)}
          </section>
        ))}

        <p className="text-muted small">
          Редакция действует с момента публикации.
          {' · '}
          <Link to="/legal/offer">Оферта</Link>
          {' · '}
          <Link to="/legal/terms">Соглашение</Link>
          {' · '}
          <Link to="/legal/privacy">Персональные данные</Link>
        </p>
      </article>
    </Page>
  );
}
