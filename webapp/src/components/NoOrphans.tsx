import { Children, cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Короткие предлоги, союзы и частицы — по правилам русской типографики
 * они не должны в одиночку виснуть в конце строки. Список — только
 * бесспорные служебные слова: случайное совпадение с обычным словом
 * здесь не страшно, неразрывный пробел просто на одну возможность
 * переноса меньше, а не заметная ошибка.
 */
const SHORT_WORDS = new Set([
  'а', 'и', 'о', 'у', 'я', 'в', 'с', 'к',
  'но', 'да', 'ли', 'бы', 'же', 'то', 'из', 'до', 'по', 'на', 'за', 'не', 'ни', 'об', 'от', 'ко', 'со', 'во',
  'что', 'как', 'для', 'или', 'при', 'под', 'над', 'без', 'про', 'чем', 'все', 'вот', 'уже', 'ещё', 'так',
  'если', 'чтобы', 'когда', 'либо', 'хотя', 'через', 'между', 'после', 'перед',
]);

function withNbsp(text: string): string {
  return text.replace(
    /(^|[\s([«])([А-ЯЁа-яё]+)([\s ])/g,
    (_match, before: string, word: string, space: string) => (
      SHORT_WORDS.has(word.toLowerCase()) ? `${before}${word} ` : `${before}${word}${space}`
    ),
  );
}

function processNode(node: ReactNode): ReactNode {
  if (typeof node === 'string') return withNbsp(node);

  if (Array.isArray(node)) {
    return Children.map(node, processNode);
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; dangerouslySetInnerHTML?: unknown };
    if (props.dangerouslySetInnerHTML || props.children === undefined) return node;
    return cloneElement(node, undefined, processNode(props.children));
  }

  return node;
}

/**
 * Оборачивает текст страницы и расставляет неразрывные пробелы после
 * коротких служебных слов — рекурсивно, по всем текстовым узлам внутри,
 * не трогая сами элементы (ссылки, картинки, разметку).
 *
 * Только для статичных информационных страниц: на пользовательский
 * контент (названия досок, имена участников) это осознанно не надевается
 * — там это не оформление сайта, а данные, которые вводил не редактор.
 */
export function NoOrphans({ children }: { children: ReactNode }): ReactElement {
  return <>{processNode(children)}</>;
}
