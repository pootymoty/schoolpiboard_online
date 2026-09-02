// Собирает каждую открытую страницу в свой HTML-файл.
//
// Одностраничное приложение поисковик видит как один пустой документ с
// одним заголовком: текста в исходнике нет, а заголовок и описание общие
// на все адреса. Поэтому после обычной сборки страницы отрисовываются
// здесь и раскладываются по файлам — с собственным заголовком, описанием
// и готовым текстом внутри.
//
// Браузеру это не мешает: приложение как загружалось, так и загружается,
// и перерисовывает страницу поверх.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

const { render, PUBLIC_PAGES, SITE_URL } = await import(join(dist + '-ssr', 'entry-server.js'));

const template = await readFile(join(dist, 'index.html'), 'utf8');

/** Экранирование для значений атрибутов: в описаниях встречаются кавычки. */
const attribute = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;');

for (const [path, meta] of Object.entries(PUBLIC_PAGES)) {
  const canonical = SITE_URL + (path === '/' ? '/' : path);

  const head = [
    `<title>${attribute(meta.title)}</title>`,
    `<meta name="description" content="${attribute(meta.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    // Open Graph: по этим полям страницу показывают в мессенджерах и
    // соцсетях. Без них там появляется голый адрес.
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${attribute(meta.title)}" />`,
    `<meta property="og:description" content="${attribute(meta.description)}" />`,
    `<meta property="og:site_name" content="SchoolPiBoard" />`,
    `<meta property="og:locale" content="ru_RU" />`,
  ].join('\n    ');

  const html = template
    // Заголовок и описание из шаблона заменяем целиком: два заголовка в
    // одном документе поисковик разбирает как придётся.
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `  ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${render(path)}</div>`);

  const file = path === '/' ? join(dist, 'index.html') : join(dist, path.slice(1), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, 'utf8');
}

// Карта сайта. Без неё поисковик находит только то, на что есть ссылки,
// и делает это заметно дольше.
const today = new Date().toISOString().slice(0, 10);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Object.keys(PUBLIC_PAGES).map((path) => (
    `  <url><loc>${SITE_URL}${path === '/' ? '/' : path}</loc><lastmod>${today}</lastmod></url>`
  )),
  '</urlset>',
].join('\n');

await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Собрано страниц: ${Object.keys(PUBLIC_PAGES).length}, плюс sitemap.xml`);
