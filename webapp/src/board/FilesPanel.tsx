import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, ApiError } from '../api/client';
import { humanSize, readLibraryFile, uploadToLibrary } from '../api/files';
import type { Library, LibraryFile } from '../api/types';
import { IconClose, IconTrash } from '../components/Icons';
import { canvasFromFile, cropCanvas, openDocument, renderPage, toPng } from './pdf';

interface Props {
  /** Кладёт готовую картинку на доску. Панель не знает ни про хаб, ни про хранилище. */
  onInsert: (blob: Blob, name: string, ratio: number) => Promise<void>;
  /** Заводит отдельную страницу доски и кладёт лист на неё. */
  onSpread: (blob: Blob, name: string, ratio: number) => Promise<void>;
  /** Заводить страницы может только владелец — остальным кнопки не показываем. */
  canSpread: boolean;
  onClose: () => void;
}

/** Ширина картинки, которая уезжает на доску. Компромисс между «читаемо» и «не мегабайты». */
const INSERT_WIDTH = 1600;

/** Ширина страницы в окне обрезки. */
const CROP_WIDTH = 1100;

/** Сколько миниатюр показываем за раз: у стостраничного файла все сразу не нужны. */
const PAGE_STEP = 60;

type View = 'library' | 'pages' | 'crop';

/**
 * Файлы: личная библиотека, выбор страниц из PDF и обрезка.
 *
 * PDF разбирается прямо в браузере: сервер хранит оригинал, а страницы
 * рисует и режет тот, кто вставляет. Загруженный однажды файл остаётся в
 * библиотеке — второй раз тот же учебник загружать не нужно.
 */
export function FilesPanel({ onInsert, onSpread, canSpread, onClose }: Props): ReactElement {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Класть ли загружаемый файл в библиотеку или только на доску, разово. */
  const [keep, setKeep] = useState(true);

  const [view, setView] = useState<View>('library');

  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [shown, setShown] = useState(PAGE_STEP);
  const [selected, setSelected] = useState<number[]>([]);

  /** Что режем: холст страницы или картинки. */
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [area, setArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Картинка страницы считается один раз на страницу: `toDataURL` заново
  // кодирует холст целиком, а во время перетаскивания рамки перерисовка
  // идёт на каждое движение пальца.
  const sourceUrl = useMemo(() => source?.toDataURL() ?? '', [source]);

  const preview = useRef<HTMLImageElement | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setLibrary(await api<Library>('/files'));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть библиотеку.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Миниатюры рисуются по очереди и появляются по мере готовности: у
  // толстого файла ждать их все — это секунды пустого экрана.
  useEffect(() => {
    if (!document) return;

    let alive = true;

    (async () => {
      const limit = Math.min(shown, document.numPages);

      for (let page = thumbs.length + 1; page <= limit; page += 1) {
        if (!alive) return;

        try {
          const canvas = await renderPage(document, page, 150);
          if (!alive) return;
          setThumbs((current) => (current.length === page - 1 ? [...current, canvas.toDataURL()] : current));
        } catch {
          return;
        }
      }
    })();

    return () => { alive = false; };
  }, [document, shown, thumbs.length]);

  const fail = (reason: unknown, fallback: string) => {
    setError(reason instanceof ApiError ? reason.message : fallback);
    setBusy(null);
  };

  /** Открывает файл: PDF — списком страниц, картинку — сразу окном обрезки. */
  const open = async (bytes: ArrayBuffer, name: string, type: string) => {
    setBusy('Открываем файл…');
    setError(null);

    try {
      if (type === 'application/pdf') {
        const opened = await openDocument(bytes);
        setDocument(opened);
        setDocumentName(name);
        setThumbs([]);
        setShown(PAGE_STEP);
        setSelected([]);
        setView('pages');
      } else {
        const canvas = await canvasFromFile(new Blob([bytes], { type }));
        setSource(canvas);
        setDocumentName(name);
        setArea(null);
        setView('crop');
      }

      setBusy(null);
    } catch (reason) {
      fail(reason, 'Не удалось открыть файл.');
    }
  };

  const pick = async (file: File) => {
    setError(null);

    try {
      const bytes = await file.arrayBuffer();

      // На тарифе без библиотеки сохранять некуда: попытка кончилась бы
      // отказом сервера, и файл не попал бы даже на доску.
      if (keep && library?.allowed !== false) {
        setBusy('Загружаем в библиотеку…');
        await uploadToLibrary(file);
        await load();
      }

      await open(bytes, file.name, file.type);
    } catch (reason) {
      fail(reason, 'Не удалось загрузить файл.');
    }
  };

  const openFromLibrary = async (file: LibraryFile) => {
    setBusy('Читаем файл…');
    setError(null);

    try {
      const bytes = await readLibraryFile(file.id);
      await open(bytes, file.name, file.contentType);
    } catch (reason) {
      fail(reason, 'Не удалось прочитать файл.');
    }
  };

  const remove = async (file: LibraryFile) => {
    if (!window.confirm(`Удалить «${file.name}» из библиотеки?`)) return;

    try {
      await api(`/files/${file.id}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      fail(reason, 'Не удалось удалить файл.');
    }
  };

  /** Отправляет холст на доску. Соотношение сторон нужно, чтобы её тянули пропорционально. */
  const insert = async (canvas: HTMLCanvasElement, name: string) => {
    const blob = await toPng(canvas);
    await onInsert(blob, name, canvas.width / canvas.height);
  };

  const insertPages = async () => {
    if (!document || selected.length === 0) return;

    setBusy('Готовим страницы…');
    setError(null);

    try {
      for (const page of [...selected].sort((a, b) => a - b)) {
        const canvas = await renderPage(document, page, INSERT_WIDTH);
        await insert(canvas, `${documentName} — с. ${page}`);
      }

      onClose();
    } catch (reason) {
      fail(reason, 'Не удалось вставить страницы.');
    }
  };

  /**
   * Отмеченные листы — каждый на свою страницу доски.
   *
   * По порядку и по одному: страницы должны встать в том же порядке, что
   * в файле, а параллельная заливка двадцати листов сразу — это двадцать
   * загрузок в одну сеть.
   */
  const spreadPages = async () => {
    if (!document || selected.length === 0) return;

    const order = [...selected].sort((a, b) => a - b);
    setError(null);

    try {
      for (const [index, page] of order.entries()) {
        setBusy(`Раскладываем: ${index + 1} из ${order.length}…`);

        const canvas = await renderPage(document, page, INSERT_WIDTH);
        await onSpread(await toPng(canvas), `${documentName} — с. ${page}`, canvas.width / canvas.height);
      }

      onClose();
    } catch (reason) {
      fail(reason, 'Не удалось разложить страницы.');
    }
  };

  const startCrop = async (page: number) => {
    if (!document) return;

    setBusy('Готовим страницу…');
    setError(null);

    try {
      setSource(await renderPage(document, page, CROP_WIDTH));
      setDocumentName(`${documentName} — с. ${page}`);
      setArea(null);
      setView('crop');
      setBusy(null);
    } catch (reason) {
      fail(reason, 'Не удалось открыть страницу.');
    }
  };

  const insertCrop = async (whole: boolean) => {
    if (!source) return;

    setBusy('Вставляем…');
    setError(null);

    try {
      await insert(whole || !area ? source : cropCanvas(source, area), documentName);
      onClose();
    } catch (reason) {
      fail(reason, 'Не удалось вставить картинку.');
    }
  };

  /** Рамка тянется по картинке: экранные точки переводим в пиксели холста. */
  const toSource = (event: ReactPointerEvent<HTMLDivElement>) => {
    const image = preview.current;
    if (!image || !source) return null;

    const box = image.getBoundingClientRect();
    const scale = source.width / box.width;

    return {
      x: Math.max(0, Math.min(source.width, (event.clientX - box.left) * scale)),
      y: Math.max(0, Math.min(source.height, (event.clientY - box.top) * scale)),
    };
  };

  const onCropDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toSource(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragFrom.current = point;
    setArea({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onCropMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    const point = from ? toSource(event) : null;
    if (!from || !point) return;

    setArea({
      x: Math.min(from.x, point.x),
      y: Math.min(from.y, point.y),
      width: Math.abs(point.x - from.x),
      height: Math.abs(point.y - from.y),
    });
  };

  const onCropUp = () => { dragFrom.current = null; };

  const percent = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div className="files" role="dialog" aria-label="Файлы">
      <div className="files__head">
        <h2 className="files__title">
          {view === 'library' ? 'Файлы' : view === 'pages' ? 'Страницы' : 'Обрезка'}
        </h2>

        {view !== 'library' ? (
          <button className="btn-quiet btn-sm" type="button" onClick={() => setView('library')}>
            Назад
          </button>
        ) : null}

        <button className="btn-tool" type="button" onClick={onClose} aria-label="Закрыть">
          <IconClose />
        </button>
      </div>

      {error ? <p className="note note-danger">{error}</p> : null}
      {busy ? <p className="text-muted small">{busy}</p> : null}

      {view === 'library' ? (
        <div className="files__body">
          {library && !library.allowed ? (
            <p className="note note-info">
              Библиотека документов и страницы PDF — на платных тарифах.
              Картинки из буфера можно вставлять на любом.
            </p>
          ) : null}

          {/* На тарифе без библиотеки кнопка не показывается: нажать её
              можно было бы, но сервер всё равно откажет — предлагать
              действие, заведомо кончающееся ошибкой, незачем. */}
          {library && !library.allowed ? null : (
            <label className="btn btn-primary files__upload">
              Выбрать файл
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void pick(file);
                }}
              />
            </label>
          )}

          <div className="check">
            <input
              id="keepFile"
              type="checkbox"
              checked={keep}
              onChange={(event) => setKeep(event.target.checked)}
            />
            <label htmlFor="keepFile">Сохранить в библиотеку</label>
          </div>

          <p className="text-muted small">
            PDF — можно выбрать страницы и обрезать. Картинки вставляются как есть.
          </p>

          {library ? (
            <>
              <div className="files__quota">
                <div className="files__bar">
                  <span style={{ width: percent(Math.min(library.used, library.quota), library.quota) }} />
                </div>
                <p className="text-muted small">
                  Занято {humanSize(library.used)} из {humanSize(library.quota)}
                </p>
              </div>

              {library.files.length === 0 ? (
                <p className="text-muted small">Библиотека пока пуста.</p>
              ) : (
                <ul className="files__list">
                  {library.files.map((file) => (
                    <li key={file.id} className="files__item">
                      <button
                        className="files__name"
                        type="button"
                        onClick={() => void openFromLibrary(file)}
                        title="Открыть"
                      >
                        {file.name}
                      </button>
                      <span className="text-muted small">{humanSize(file.size)}</span>
                      <button
                        className="btn-tool"
                        type="button"
                        onClick={() => void remove(file)}
                        aria-label={`Удалить ${file.name}`}
                      >
                        <IconTrash />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {view === 'pages' && document ? (
        <div className="files__body">
          <p className="text-muted small">
            Отметьте страницы. Их можно вставить сюда, одну рядом с другой, или разложить —
            каждую отдельной страницей занятия. Обрезать можно любую, по одной.
          </p>

          <div className="files__pages">
            {thumbs.map((thumb, index) => {
              const page = index + 1;
              const chosen = selected.includes(page);

              return (
                <div key={page} className={chosen ? 'files__page files__page--on' : 'files__page'}>
                  <button
                    type="button"
                    className="files__thumb"
                    onClick={() => setSelected((current) => (
                      chosen ? current.filter((value) => value !== page) : [...current, page]
                    ))}
                  >
                    <img src={thumb} alt={`Страница ${page}`} />
                    <span>{page}</span>
                  </button>

                  <button className="btn-quiet btn-sm" type="button" onClick={() => void startCrop(page)}>
                    Обрезать
                  </button>
                </div>
              );
            })}
          </div>

          {shown < document.numPages ? (
            <button
              className="btn-quiet btn-sm"
              type="button"
              onClick={() => setShown((current) => current + PAGE_STEP)}
            >
              Показать ещё ({document.numPages - shown})
            </button>
          ) : null}

          <button
            className="btn-primary btn-block"
            type="button"
            disabled={selected.length === 0 || busy !== null}
            onClick={() => void insertPages()}
          >
            Вставить на эту страницу {selected.length > 0 ? `(${selected.length})` : ''}
          </button>

          {/* Разложить по страницам может только владелец: страницы
              заводит он. */}
          {canSpread ? (
            <button
              className="btn-outline btn-block"
              type="button"
              disabled={selected.length === 0 || busy !== null}
              onClick={() => void spreadPages()}
              title="Каждый лист — отдельной страницей занятия, запертой подложкой"
            >
              Разложить по страницам {selected.length > 0 ? `(${selected.length})` : ''}
            </button>
          ) : null}
        </div>
      ) : null}

      {view === 'crop' && source ? (
        <div className="files__body">
          <p className="text-muted small">Обведите нужный кусок — или вставьте целиком.</p>

          <div
            className="files__crop"
            onPointerDown={onCropDown}
            onPointerMove={onCropMove}
            onPointerUp={onCropUp}
          >
            <img ref={preview} src={sourceUrl} alt={documentName} />

            {area && area.width > 2 && area.height > 2 ? (
              <span
                className="files__frame"
                style={{
                  left: percent(area.x, source.width),
                  top: percent(area.y, source.height),
                  width: percent(area.width, source.width),
                  height: percent(area.height, source.height),
                }}
              />
            ) : null}
          </div>

          <div className="row">
            <button
              className="btn-primary"
              type="button"
              disabled={!area || area.width < 4 || busy !== null}
              onClick={() => void insertCrop(false)}
            >
              Вставить фрагмент
            </button>
            <button
              className="btn-outline"
              type="button"
              disabled={busy !== null}
              onClick={() => void insertCrop(true)}
            >
              Вставить целиком
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
