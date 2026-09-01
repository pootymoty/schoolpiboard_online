import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Работа с PDF — целиком в браузере.
 *
 * Страницы режет и рисует сам pdf.js: серверу для этого понадобился бы
 * конвертер вроде LibreOffice, а его там намеренно нет — на сервере
 * только рантайм, база и Redis.
 *
 * Библиотека подгружается по требованию: она весит около мегабайта, и
 * тащить её в основной пакет ради тех, кто ничего не вставляет, незачем.
 */
let loading: Promise<typeof import('pdfjs-dist')> | null = null;

async function pdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!loading) {
    loading = (async () => {
      const library = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

      library.GlobalWorkerOptions.workerSrc = worker.default;
      return library;
    })();
  }

  return loading;
}

export async function openDocument(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const library = await pdfjs();

  // Копия намеренно: pdf.js забирает буфер себе, и повторно открыть тот
  // же файл (например, чтобы вставить вторую страницу) стало бы нечем.
  return library.getDocument({ data: bytes.slice(0) }).promise;
}

/**
 * Рисует страницу на холст.
 *
 * Масштаб задаётся не множителем, а нужной шириной: страницы бывают от
 * визитки до плаката, и один множитель дал бы то мыло, то файл на
 * двадцать мегабайт.
 */
export async function renderPage(
  document: PDFDocumentProxy, pageNumber: number, targetWidth: number,
): Promise<HTMLCanvasElement> {
  const page = await document.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / base.width });

  const canvas = window.document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Холст недоступен.');

  // Белая подложка: в PDF фон обычно прозрачный, и на тёмной доске
  // страница превратилась бы в чёрный прямоугольник с чёрными буквами.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

/** Кусок холста отдельной картинкой — по нему делается обрезка. */
export function cropCanvas(
  source: HTMLCanvasElement,
  area: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));

  const context = canvas.getContext('2d');
  if (context) {
    context.drawImage(
      source,
      Math.round(area.x), Math.round(area.y), canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height,
    );
  }

  return canvas;
}

/** Холст в PNG. Промис — потому что `toBlob` отдаёт результат не сразу. */
export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось получить картинку.'))),
      'image/png',
    );
  });
}

/** Картинка из файла — чтобы обрезать её тем же способом, что и страницу. */
export function canvasFromFile(file: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const canvas = window.document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      canvas.getContext('2d')?.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Это не картинка.'));
    };

    image.src = url;
  });
}
