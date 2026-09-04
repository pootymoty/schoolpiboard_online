import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { readGuestToken, writeGuestToken } from '../api/guest';
import type { BoardState } from '../api/types';
import { BoardShell } from '../components/Layout';
import { CanvasPanel } from '../components/CanvasPanel';
import { Modal } from '../components/Modal';
import { PeoplePanel } from '../components/PeoplePanel';
import { IconCheck, IconLink, IconLockClosed, IconLockOpen, IconPeople } from '../components/Icons';
import { BoardCanvas } from '../board/BoardCanvas';
import { FilesPanel } from '../board/FilesPanel';
import { DrawToolbar, ViewToolbar } from '../board/BoardToolbar';
import { ToolSettingsPanel } from '../board/ToolSettingsPanel';
import { DEFAULT_SETTINGS, TOOLS_WITH_SETTINGS } from '../board/tools';
import type { Tool, ToolSettings } from '../board/tools';
import type { ItemData, ItemType, Point } from '../board/protocol';
import { erase } from '../board/erase';
import { readClip, writeClip } from '../board/clipboard';
import { TextInput } from '../board/TextInput';
import {
  cellAt, cellRect, cellText, resized as resizedTable, tableBox, withCell,
} from '../board/tables';
import { fontOf } from '../board/render';
import { boundsOf, pointsOf, translate } from '../board/geometry';
import { measureText } from '../board/handles';
import { SelectionPanel } from '../board/SelectionPanel';
import { BackgroundPanel } from '../board/BackgroundPanel';
import { PagesPanel } from '../board/PagesPanel';
import { LibraryPanel } from '../board/LibraryPanel';
import type { Template } from '../board/library';
import type { TemplateItem } from '../api/templates';
import { TimerPanel } from '../board/TimerPanel';
import { HelpPanel } from '../board/HelpPanel';
import { exportPng } from '../board/exportPng';
import { uploadBoardImage } from '../api/files';
import { canvasFromFile, toPng } from '../board/pdf';
import { useBoardHub } from '../board/useBoardHub';
import { useWaitingQueue } from '../board/useWaitingQueue';
import { useHistory } from '../board/useHistory';
import type { ItemSnapshot } from '../board/useHistory';
import { INITIAL_VIEWPORT, centerOn, fitToContent, toScreen, toWorld, zoomAt } from '../board/viewport';
import type { Viewport } from '../board/viewport';

/**
 * Страница доски.
 *
 * На виду только холст и участники: на доске рисуют, и всё, что нужно
 * изредка — ссылка, замок, настройки — убрано в кнопки и всплывающие окна.
 */
export function BoardPage(): ReactElement {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const id = Number(boardId);

  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Свёрнута по умолчанию: на телефоне список участников занимает весь
  // экран и закрывает холст, а бейдж на кнопке всё равно сообщит о новых
  // заявках в очереди, даже пока панель скрыта.
  const [showPeople, setShowPeople] = useState(false);
  // Сразу после создания доски открываем окно со ссылкой сами: доска на
  // пустом экране обещает, что ссылка появится сразу, а не через три клика.
  const [showLink, setShowLink] = useState(() => Boolean((location.state as { openLink?: boolean } | null)?.openLink));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Флаг нужен только один раз, сразу после перехода: убираем его из
    // истории, иначе окно снова откроется при возврате кнопкой «назад».
    if ((location.state as { openLink?: boolean } | null)?.openLink) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // Срабатывает один раз при монтировании: id доски в пути не меняется.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [tool, setToolRaw] = useState<Tool>('pen1');
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_SETTINGS);
  const [showParams, setShowParams] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  /** Есть ли что вставлять. Кнопка вставки без содержимого только мешает. */
  const [hasClip, setHasClip] = useState(() => readClip() !== null);

  // Название правится прямо на холсте: щёлкнул — поле, галочка — сохранил.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  /** Куда поставить надпись. Пока задано — на холсте открыто поле ввода. */
  const [textAt, setTextAt] = useState<Point | null>(null);

  /**
   * Что правим прямо сейчас: ячейку таблицы или надпись внутри фигуры.
   * У фигуры строк и столбцов нет, поэтому они пустые.
   */
  const [cellEdit, setCellEdit] = useState<
    { itemId: number; row: number; col: number; at: Point } | null
  >(null);

  // Повторный щелчок по уже выбранному рисующему инструменту открывает
  // его параметры — отдельной кнопки настройки для этого не нужно.
  const setTool = (next: Tool) => {
    setShowParams(next === tool && TOOLS_WITH_SETTINGS.includes(next) ? !showParams : false);
    setToolRaw(next);
  };

  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Свежие вид и габариты для обработчиков вставки: они висят на окне и
  // иначе видели бы состояние на момент подписки.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const canvasRef = useRef(canvasSize);
  canvasRef.current = canvasSize;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [selection, setSelection] = useState<number[]>([]);

  const hub = useBoardHub(id);
  const queue = useWaitingQueue(id, hub.canManage);

  /**
   * Устойчивые ссылки на свои объекты.
   *
   * Номер объекта задаёт сервер, и при восстановлении после отмены он
   * будет уже другим. История держится за ссылку, а этот реестр
   * переводит её в текущий номер и обратно.
   */
  const refToId = useRef(new Map<string, number>());
  const idToRef = useRef(new Map<number, string>());

  /** Что ждёт номера от сервера: временный ключ → ссылка и снимок. */
  const pending = useRef(new Map<string, { ref: string; snapshot?: ItemSnapshot }>());

  const idsOf = useCallback((refs: string[]) => (
    refs.map((ref) => refToId.current.get(ref)).filter((id): id is number => id !== undefined)
  ), []);

  /** Отправляет объект на доску и запоминает, под какой ссылкой он живёт. */
  const send = useCallback((ref: string, type: ItemType, data: ItemData, imageRef?: string | null) => {
    const tempId = `${ref}-${Date.now().toString(36)}`;
    pending.current.set(tempId, { ref });
    hub.commitItem(tempId, type, data, imageRef);
  }, [hub]);

  const history = useHistory({
    restore: (snapshot) => send(snapshot.ref, snapshot.type, snapshot.data, snapshot.imageRef),
    move: (refs, dx, dy) => hub.moveItems(idsOf(refs), dx, dy),
    remove: (refs) => hub.deleteItems(idsOf(refs)),
  });

  // Номер объекта известен только после закрепления на сервере — тогда же
  // ссылка и связывается с ним.
  useEffect(() => {
    // Разбираем весь список: разобранное из ожидания уже вычеркнуто и
    // второй раз не попадётся.
    for (const commit of hub.commits) {
      const waiting = pending.current.get(commit.tempId);
      if (!waiting) continue;

      pending.current.delete(commit.tempId);
      refToId.current.set(waiting.ref, commit.itemId);
      idToRef.current.set(commit.itemId, waiting.ref);

      if (waiting.snapshot) history.push({ kind: 'create', items: [waiting.snapshot] });
    }
  }, [hub.commits, history]);

  /** Ссылка объекта: своя, если он наш, иначе заводим новую. */
  const refOf = useCallback((itemId: number) => {
    const existing = idToRef.current.get(itemId);
    if (existing) return existing;

    const ref = `r${itemId}`;
    idToRef.current.set(itemId, ref);
    refToId.current.set(ref, itemId);
    return ref;
  }, []);

  // Выделять то, чего уже нет, нельзя: объект мог стереть кто-то другой.
  useEffect(() => {
    const alive = new Set(hub.items.map((item) => item.id));
    setSelection((current) => (
      current.every((id) => alive.has(id)) ? current : current.filter((id) => alive.has(id))
    ));
  }, [hub.items]);

  const removeSelection = useCallback(() => {
    if (selection.length === 0) return;

    // Запертое не удаляется: в этом и смысл замка. Отпереть можно
    // кнопкой в панели выделения.
    const doomed = hub.items.filter((item) => selection.includes(item.id) && !item.data.locked);
    if (doomed.length === 0) return;
    history.push({
      kind: 'delete',
      items: doomed.map((item) => ({
        ref: refOf(item.id), type: item.type, data: item.data, imageRef: item.imageRef,
      })),
    });

    hub.deleteItems(doomed.map((item) => item.id));
    setSelection([]);
  }, [hub, history, refOf, selection]);

  /**
   * Ластик. Задетый штрих не удаляется целиком: от него остаются куски,
   * и они заводятся заново под своими ссылками — сервер умеет создавать
   * и удалять, но не резать чужую геометрию.
   */
  const eraseAt = useCallback((at: Point, radius: number) => {
    const doomed: number[] = [];
    const born: { ref: string; type: ItemType; data: ItemData }[] = [];
    const undoItems: ItemSnapshot[] = [];

    for (const item of hub.items) {
      // Удаление уходит на сервер и возвращается не мгновенно, а ластик
      // ведут дальше — без этой отметки тот же штрих резался бы снова на
      // каждом движении, и его куски множились бы.
      if (erased.current.has(item.id)) continue;

      const result = erase(item, at, radius);
      if (result.kind === 'keep') continue;

      erased.current.add(item.id);
      doomed.push(item.id);
      undoItems.push({ ref: refOf(item.id), type: item.type, data: item.data, imageRef: item.imageRef });

      if (result.kind === 'split') {
        for (const part of result.parts) {
          born.push({ ref: `e${Date.now().toString(36)}${born.length}`, type: item.type, data: part });
        }
      }
    }

    if (doomed.length === 0) return;

    hub.deleteItems(doomed);
    for (const part of born) send(part.ref, part.type, part.data);

    history.push({ kind: 'delete', items: undoItems });
  }, [hub, history, refOf, send]);

  /** Уже стёртое за этот проход ластика. Сбрасывается, когда его отпускают. */
  const erased = useRef(new Set<number>());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const control = event.ctrlKey || event.metaKey;

      if (control && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo(); else history.undo();
        return;
      }

      if (control && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        return;
      }

      if (control && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (control && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }

      if (control && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        copySelection();
        removeSelection();
        return;
      }

      if (control && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClip();
        return;
      }

      if (control && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection(hub.items.map((item) => item.id));
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelection();
        return;
      }

      // Esc возвращает к курсору и снимает выделение — как в десктопной версии.
      if (event.key === 'Escape') setSelection([]);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, hub.items, removeSelection]);

  // Наблюдателю рисующие инструменты недоступны — оставляем ему руку,
  // иначе выбранное «перо» просто ничего не делало бы (пункт про роли).
  useEffect(() => {
    if (!hub.canEdit && tool !== 'hand') setToolRaw('hand');
  }, [hub.canEdit, tool]);

  /** Закрепляет надпись. Размеры меряем здесь: по ним считаются габариты. */
  const commitText = (text: string) => {
    const where = textAt;
    setTextAt(null);
    if (!where || !text.trim()) return;

    const data: ItemData = {
      x1: where.x,
      y1: where.y,
      text,
      fontSize: settings.text.fontSize,
      color: settings.text.color,
      width: 1,
    };

    const context = document.createElement('canvas').getContext('2d');
    const lines = text.split('\n');
    const lineHeight = settings.text.fontSize * 1.25;

    if (context) {
      context.font = fontOf(data);
      data.x2 = where.x + Math.max(...lines.map((line) => context.measureText(line).width));
      data.y2 = where.y + lines.length * lineHeight;
    }

    const ref = `t${Date.now().toString(36)}`;
    pending.current.set(`${ref}-new`, { ref, snapshot: { ref, type: 'text', data } });
    hub.commitItem(`${ref}-new`, 'text', data);
  };

  /**
   * Открывает поле ввода в ячейке таблицы.
   *
   * Поле ставится в саму ячейку, а не рядом: набранное должно оказаться
   * там же, куда смотрит человек.
   */
  const editCell = (itemId: number, world: Point) => {
    const item = hub.items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    if (item.type === 'shape') {
      // Надпись внутри фигуры одна на всю фигуру: поле открывается по её
      // середине, там же, где надпись потом и окажется.
      const x1 = item.data.x1 ?? 0;
      const y1 = item.data.y1 ?? 0;
      const x2 = item.data.x2 ?? x1;
      const y2 = item.data.y2 ?? y1;

      setCellEdit({
        itemId,
        row: -1,
        col: -1,
        at: {
          x: Math.min(x1, x2) + 4,
          y: (y1 + y2) / 2 - (item.data.fontSize ?? 20) * 0.6,
          p: 1,
        },
      });
      return;
    }

    const where = cellAt(item.data, world);
    if (!where) return;

    const rect = cellRect(tableBox(item.data), where.row, where.col);

    setCellEdit({
      itemId,
      row: where.row,
      col: where.col,
      at: { x: rect.x + 3, y: rect.y + rect.height / 2 - (item.data.fontSize ?? 20) * 0.6, p: 1 },
    });
  };

  const commitCell = (text: string) => {
    const edit = cellEdit;
    setCellEdit(null);
    if (!edit) return;

    const item = hub.items.find((candidate) => candidate.id === edit.itemId);
    if (!item) return;

    if (item.type === 'shape') {
      hub.updateItem(item.id, { ...item.data, label: text || undefined });
      return;
    }

    hub.updateItem(item.id, withCell(item.data, edit.row, edit.col, text));
  };

  const selectedItems = hub.items.filter((item) => selection.includes(item.id));

  /** Таблица, ячейку которой правят: из неё берутся цвет и размер шрифта. */
  const tableItem = cellEdit
    ? hub.items.find((item) => item.id === cellEdit.itemId) ?? null
    : null;

  const selectionBounds = selectedItems.length > 0 ? boundsOf(selectedItems) : null;

  /**
   * На узком экране панель выделения встаёт на место инструментов.
   * Ширина берётся от холста, а не от окна: холст и есть то место, где
   * панелям тесно.
   */
  const docked = Boolean(
    selectionBounds && hub.canEdit && canvasSize.width > 0 && canvasSize.width < 720,
  );

  /** Копия выделенного со сдвигом — чтобы копия не легла ровно поверх оригинала. */
  const duplicateSelection = () => {
    for (const item of selectedItems) {
      const ref = `c${item.id}-${Date.now().toString(36)}`;
      const data = translate(item.data, 16, 16);
      const snapshot = { ref, type: item.type, data, imageRef: item.imageRef };

      pending.current.set(`${ref}-new`, { ref, snapshot });
      hub.commitItem(`${ref}-new`, item.type, data, item.imageRef);
    }
  };

  /**
   * Копирование в буфер доски. Свой буфер, а не системный: в системный
   * кладут текст и картинки, и затирать им чужое незачем.
   */
  const copySelection = () => {
    if (selectedItems.length === 0) return;

    setHasClip(true);
    writeClip({
      boardId: Number(id),
      items: selectedItems.map((item) => ({
        type: item.type,
        data: item.data,
        imageRef: item.imageRef,
      })),
    });
  };

  /**
   * Вставка из буфера доски — со сдвигом, чтобы копия не легла ровно
   * поверх оригинала.
   *
   * Картинки между досками не переносятся: файл принадлежит своей доске
   * и уйдёт вместе с ней, а объект остался бы пустой рамкой. Внутри
   * одной доски они вставляются как есть.
   */
  const pasteClip = () => {
    const clip = readClip();
    if (!clip) return;

    const sameBoard = clip.boardId === Number(id);
    const items = clip.items.filter((item) => sameBoard || item.type !== 'image');

    if (items.length === 0) {
      setError('Картинки не переносятся на другую доску: файл остаётся у своей.');
      return;
    }

    if (items.length < clip.items.length) {
      setError('Картинки не перенеслись: файл остаётся у своей доски. Остальное вставлено.');
    }

    const born: string[] = [];

    for (const item of items) {
      const ref = `v${Date.now().toString(36)}-${born.length}`;
      const data = translate(item.data, 24, 24);

      born.push(ref);
      pending.current.set(`${ref}-new`, {
        ref,
        snapshot: { ref, type: item.type, data, imageRef: item.imageRef },
      });
      hub.commitItem(`${ref}-new`, item.type, data, item.imageRef);
    }
  };

  const lockSelection = (locked: boolean) => {
    for (const item of selectedItems) {
      hub.updateItem(item.id, { ...item.data, locked: locked || undefined });
    }
  };

  const recolorSelection = (color: string) => {
    for (const item of selectedItems) hub.updateItem(item.id, { ...item.data, color });
  };

  /**
   * Кладёт картинку на доску: сначала файл уезжает на сервер, потом на
   * доску кладётся объект со ссылкой на него.
   *
   * Размер подбирается по видимой части холста, а не по пикселям файла:
   * страница А4 в натуральную величину при мелком масштабе оказалась бы
   * с ноготок, а при крупном — заняла бы полдоски.
   */
  const insertImage = useCallback(async (blob: Blob, name: string, ratio: number) => {
    const uploaded = await uploadBoardImage(id, blob, name, readGuestToken(id));

    const view = viewportRef.current;
    const size = canvasRef.current;

    // Половина видимой ширины: рядом остаётся место, чтобы писать.
    const width = (size.width > 0 ? size.width * 0.5 : 480) / view.scale;
    const height = width / (ratio > 0 ? ratio : 1);

    const center = toWorld(view, size.width / 2, size.height / 2);
    const x1 = center.x - width / 2;
    const y1 = center.y - height / 2;

    const data: ItemData = {
      x1,
      y1,
      x2: x1 + width,
      y2: y1 + height,
      ratio,
      color: '#000000',
      // Ноль: рамка выделения у картинки идёт ровно по её краю, а не с
      // отступом на толщину линии, которой у неё нет.
      width: 0,
    };

    const ref = `i${Date.now().toString(36)}`;
    pending.current.set(`${ref}-new`, {
      ref,
      snapshot: { ref, type: 'image', data, imageRef: uploaded.imageRef },
    });

    hub.commitItem(`${ref}-new`, 'image', data, uploaded.imageRef);
  }, [hub, id]);

  /**
   * Лист PDF отдельной страницей доски.
   *
   * Страницу заводим и тут же кладём на неё лист, не открывая её у себя:
   * иначе разбор двадцатистраничного файла превратился бы в двадцать
   * перелистываний на глазах у всего занятия.
   *
   * Лист заперт — по нему пишут, а сдвинуть его случайно нельзя. Отпереть
   * можно замком в панели выделения.
   */
  const spreadPage = useCallback(async (blob: Blob, name: string, ratio: number) => {
    const uploaded = await uploadBoardImage(id, blob, name, readGuestToken(id));

    const pageId = await hub.addPageNow(name);
    if (pageId === null) throw new Error('Страница не завелась: на доске их предел.');

    const view = viewportRef.current;
    const size = canvasRef.current;

    // Шире, чем разовая вставка: здесь лист — вся страница, а не
    // картинка рядом с записями.
    const width = (size.width > 0 ? size.width * 0.7 : 640) / view.scale;
    const height = width / (ratio > 0 ? ratio : 1);

    const center = toWorld(view, size.width / 2, size.height / 2);
    const x1 = center.x - width / 2;
    const y1 = center.y - height / 2;

    const data: ItemData = {
      x1,
      y1,
      x2: x1 + width,
      y2: y1 + height,
      ratio,
      locked: true,
      color: '#000000',
      width: 0,
    };

    // Без ссылки и без истории: объект лёг на чужую страницу, и отменять
    // его поштучно незачем — не нужна вся раскладка, удаляют страницы.
    hub.commitItem(`d${Date.now().toString(36)}-${pageId}`, 'image', data, uploaded.imageRef, pageId);
  }, [hub, id]);

  /**
   * Переносит холст к курсору участника.
   *
   * Масштаб не трогаем: человек подбирал его под свою работу, и менять
   * его ради того, чтобы «найти соседа», значит сбить ему вид.
   */
  const goToCursor = useCallback((connectionId: string) => {
    const at = hub.cursors.find((cursor) => cursor.id === connectionId);
    if (!at) return;

    setViewport((current) => centerOn(
      current, at.x, at.y, canvasRef.current.width, canvasRef.current.height,
    ));
  }, [hub.cursors]);

  /** Картинка из буфера или перетащенный файл — та же дорога, что и у вставки из панели. */
  const insertFile = useCallback(async (file: Blob, name: string) => {
    try {
      const canvas = await canvasFromFile(file);
      await insertImage(await toPng(canvas), name, canvas.width / canvas.height);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось вставить картинку.');
    }
  }, [insertImage]);

  /** Текст из буфера — обычная надпись в середине видимой части холста. */
  const pasteText = useCallback((text: string) => {
    const view = viewportRef.current;
    const size = canvasRef.current;
    const at = toWorld(view, size.width / 2, size.height / 2);

    const data: ItemData = {
      x1: at.x,
      y1: at.y,
      text,
      fontSize: settingsRef.current.text.fontSize,
      color: settingsRef.current.text.color,
      width: 1,
    };

    const box = measureText(text, data.fontSize ?? 24);
    data.x2 = at.x + box.width;
    data.y2 = at.y + box.height;

    const ref = `p${Date.now().toString(36)}`;
    pending.current.set(`${ref}-new`, { ref, snapshot: { ref, type: 'text', data } });
    hub.commitItem(`${ref}-new`, 'text', data);
  }, [hub]);

  /**
   * Заготовка из библиотеки.
   *
   * Собирается здесь, а не в панели: только доска знает, куда смотрит
   * человек и в каком масштабе. Размер берём от видимой части холста —
   * заготовка должна занимать примерно одно и то же место на экране и
   * при мелком масштабе, и при крупном.
   */
  const insertTemplate = useCallback((template: Template, params: Record<string, number>) => {
    const view = viewportRef.current;
    const size = canvasRef.current;

    const center = toWorld(view, size.width / 2, size.height / 2);
    const side = ((size.width > 0 ? Math.min(size.width, size.height) : 520) * 0.62) / view.scale;

    const style = settingsRef.current;
    const drafts = template.build(
      {
        cx: center.x,
        cy: center.y,
        size: side,
        color: style.shapes.color,
        width: style.shapes.width,
        fontSize: style.text.fontSize,
      },
      params,
    );

    if (drafts.length === 0) return;

    const stamp = Date.now().toString(36);
    const snapshots: ItemSnapshot[] = [];

    drafts.forEach((draft, index) => {
      const ref = `g${stamp}-${index}`;
      snapshots.push({ ref, type: draft.type, data: draft.data });
      send(ref, draft.type, draft.data);
    });

    // Одна запись в истории на всю заготовку: отменять чертёж по линии —
    // полсотни нажатий, и до нужного места человек не доберётся.
    history.push({ kind: 'create', items: snapshots });
  }, [history, send]);

  /**
   * Своя заготовка из папки «Мои».
   *
   * Она уже собрана — остаётся перенести её к середине видимой части
   * холста. Размер не трогаем: заготовку сохраняли такой, какой она
   * нужна, и подгонять её под окно значило бы менять кегль подписей.
   */
  const insertItems = useCallback((items: TemplateItem[]) => {
    if (items.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of items) {
      for (const point of pointsOf(item.data)) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }

    if (minX === Infinity) return;

    const view = viewportRef.current;
    const size = canvasRef.current;
    const center = toWorld(view, size.width / 2, size.height / 2);

    const dx = center.x - (minX + maxX) / 2;
    const dy = center.y - (minY + maxY) / 2;

    const stamp = Date.now().toString(36);
    const snapshots: ItemSnapshot[] = [];

    items.forEach((item, index) => {
      const ref = `m${stamp}-${index}`;
      const data = translate(item.data, dx, dy);

      snapshots.push({ ref, type: item.type, data });
      send(ref, item.type, data);
    });

    history.push({ kind: 'create', items: snapshots });
  }, [history, send]);

  /**
   * Вставка чего угодно из буфера: картинка ложится картинкой, текст —
   * надписью, файл — как обычная загрузка. Гостю это закрыто вместе со
   * всей загрузкой файлов.
   */
  useEffect(() => {
    if (!hub.canEdit || state?.me.isGuest !== false) return;

    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (const entry of items) {
        if (entry.kind === 'file') {
          const file = entry.getAsFile();
          if (!file) continue;

          event.preventDefault();
          void insertFile(file, file.name || 'Вставка');
          return;
        }
      }

      const text = event.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;

      event.preventDefault();
      pasteText(text);
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [hub.canEdit, state?.me.isGuest, insertFile, pasteText]);


  const zoomBy = (factor: number) => {
    // От середины холста: кнопкой масштабируют, не целясь в точку.
    setViewport((current) => zoomAt(current, canvasSize.width / 2, canvasSize.height / 2, factor));
  };

  const fitToAll = () => {
    const points = hub.items.flatMap((item) => pointsOf(item.data));
    const next = fitToContent(points, canvasSize.width, canvasSize.height);
    if (next) setViewport(next);
  };

  const load = useCallback(async () => {
    try {
      setState(await api<BoardState>(`/boards/${id}/state`, { guestToken: readGuestToken(id) }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось открыть доску.');
    }
  }, [id]);

  // Хаба с живым присутствием пока нет (появится вместе с холстом), поэтому
  // список участников и состояние доски держим свежими опросом: иначе
  // подключившийся не появится у остальных, пока кто-то не обновит страницу.
  useEffect(() => {
    if (!Number.isFinite(id)) return;

    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [id, load]);

  const toggleLock = async () => {
    if (!state) return;
    setBusy(true);

    try {
      await api(`/boards/${id}/lock`, { method: 'POST', body: { value: !state.board.locked } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить замок.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoAdmit = async () => {
    if (!state) return;

    try {
      await api(`/boards/${id}/auto-admit`, { method: 'POST', body: { value: !state.board.autoAdmit } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось изменить настройку.');
    }
  };

  const reissue = async () => {
    if (!window.confirm('Выпустить новую ссылку? Прежняя перестанет работать сразу.')) return;

    try {
      await api(`/boards/${id}/reissue-link`, { method: 'POST' });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось перевыпустить ссылку.');
    }
  };

  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || !state || trimmed === state.board.title) return;

    try {
      await api(`/boards/${id}`, { method: 'PATCH', body: { title: trimmed } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось переименовать доску.');
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер может быть недоступен — ссылка видна, её можно выделить руками.
      setError('Скопировать не вышло. Выделите ссылку и скопируйте вручную.');
    }
  };

  const leaveGuest = async () => {
    try {
      // Владелец не должен видеть ушедшего гостя ещё до истечения допуска —
      // сообщаем серверу явно, а не ждём, пока запись протухнет сама.
      await api(`/boards/${id}/leave`, { method: 'POST', guestToken: readGuestToken(id) });
    } catch {
      // Сеть подвела — не страшно: запись пропадёт сама по истечении допуска.
    } finally {
      writeGuestToken(id, null);
      navigate('/', { replace: true });
    }
  };

  if (error && !state) {
    return (
      <BoardShell>
        <div className="card">
          <h1>Доска</h1>
          <p className="note note-danger">{error}</p>
          <p className="text-muted small">
            Возможно, вас убрали с доски или ссылку перевыпустили. Попросите
            новую у того, кто вас позвал.
          </p>
        </div>
      </BoardShell>
    );
  }

  if (!state) {
    return (
      <BoardShell>
        <p className="text-muted">Загружаем доску…</p>
      </BoardShell>
    );
  }

  const { board, me, members, guests } = state;
  // Свой собственный гостевой вход отдельной строкой ниже — из общего
  // списка его убираем, иначе человек видел бы себя дважды.
  const otherGuests = guests.filter((guest) => guest.guestId !== me.guestId);
  // Ровно то же число, что показывает сам список. Раньше кнопка считала
  // по присутствию в хабе, а список — по составу доски; это разные вещи,
  // и они расходились: впущенный появлялся в списке, а на кнопке нет.
  const presentCount = members.length + otherGuests.length + (me.isGuest ? 1 : 0);

  return (
    <BoardShell>
      <div className="board-page">
        {board.canManage ? (
          <div className="board-page__bar">
            <button
              className="btn-tool btn-tool--wide"
              type="button"
              onClick={toggleLock}
              disabled={busy}
              aria-pressed={board.locked}
              title={board.locked
                ? 'Доска закрыта: по ссылке не войти. Нажмите, чтобы открыть'
                : 'Доска открыта: по ссылке можно проситься. Нажмите, чтобы закрыть'}
            >
              {board.locked ? <IconLockClosed /> : <IconLockOpen />}
              <span>{board.locked ? 'Закрыта' : 'Открыта'}</span>
            </button>

            <button
              className="btn-tool btn-tool--wide"
              type="button"
              onClick={() => setShowLink(true)}
              title="Ссылка на доску"
            >
              <IconLink />
              <span>Ссылка</span>
            </button>
          </div>
        ) : null}

        {error ?? hub.error ? <p className="note note-danger">{error ?? hub.error}</p> : null}

        {board.locked && board.canManage ? (
          <p className="note note-warning">
            Доска закрыта: новые по ссылке войти не могут. Те, кто уже здесь,
            остаются.
          </p>
        ) : null}

        <section
          className="board-page__canvas"
          onDragOver={(event) => {
            if (hub.canEdit && !me.isGuest) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!hub.canEdit || me.isGuest) return;

            const file = event.dataTransfer.files?.[0];
            if (!file) return;

            event.preventDefault();
            void insertFile(file, file.name);
          }}
        >
          {/* Название — в верхнем левом углу холста. Править может только
              владелец, щёлкнув по надписи. */}
          <div className="board-title">
            {editingTitle ? (
              <>
                <input
                  className="board-title__input"
                  type="text"
                  autoFocus
                  maxLength={200}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveTitle();
                    if (event.key === 'Escape') setEditingTitle(false);
                  }}
                />
                <button className="btn-tool" type="button" onClick={saveTitle} aria-label="Сохранить название">
                  <IconCheck />
                </button>
              </>
            ) : board.canManage ? (
              <button
                className="board-title__text"
                type="button"
                onClick={() => { setTitleDraft(board.title); setEditingTitle(true); }}
                title="Переименовать доску"
              >
                {board.title}
              </button>
            ) : (
              <p className="board-title__text">{board.title}</p>
            )}
          </div>

          {/* Панель показывается всем: наблюдателю нужны рука и масштаб,
              а рисующие кнопки у него просто заблокированы. */}
          {/* Пока на узком экране что-то выбрано, слева стоит панель
              выделения, а не инструменты: две панели там не помещаются,
              и раньше они наезжали друг на друга и на кнопку участников. */}
          {docked ? null : (
          <DrawToolbar
            tool={tool}
            settings={settings}
            canEdit={hub.canEdit}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onTool={setTool}
            onUndo={history.undo}
            onRedo={history.redo}
          />
          )}

          <ViewToolbar
            canManage={hub.canManage}
            canEdit={hub.canEdit}
            canUpload={hub.canEdit && !me.isGuest}
            canPaste={hasClip && hub.canEdit}
            onPaste={pasteClip}
            onPages={() => setShowPages((current) => !current)}
            pageLabel={
              hub.pages.length === 0
                ? '—'
                : `${Math.max(1, hub.pages.findIndex((page) => page.id === hub.pageId) + 1)}/${hub.pages.length}`
            }
            onFiles={() => setShowFiles((current) => !current)}
            onLibrary={() => setShowLibrary((current) => !current)}
            scale={viewport.scale}
            onBackground={() => setShowBackground((current) => !current)}
            onTimer={() => setShowTimer((current) => !current)}
            onHelp={() => setShowHelp((current) => !current)}
            onExport={() => {
              void exportPng(hub.items, hub.background, board.title).then((saved) => {
                if (!saved) setError('Доска пуста — сохранять нечего.');
              });
            }}
            onZoom={zoomBy}
            onResetZoom={() => setViewport((current) => {
              // С выделением сотня означает «покажи вот это в натуральную
              // величину», а не «верни масштаб и потеряй объект из виду».
              if (!selectionBounds) return { ...current, scale: 1 };

              return centerOn(
                current,
                selectionBounds.x + selectionBounds.width / 2,
                selectionBounds.y + selectionBounds.height / 2,
                canvasSize.width, canvasSize.height, 1,
              );
            })}
            onFit={fitToAll}
            onClear={() => {
              if (window.confirm('Очистить страницу? Всё на ней пропадёт у всех.')) hub.clearBoard();
            }}
          />

          <BoardCanvas
            hub={hub}
            tool={tool}
            settings={settings}
            viewport={viewport}
            background={hub.background}
            selection={selection}
            onViewport={setViewport}
            onSize={setCanvasSize}
            onSelection={setSelection}
            onMoved={(itemIds, dx, dy) => {
              // Запертое стоит на месте, даже если попало в общее выделение.
              const movable = itemIds.filter((itemId) => (
                !hub.items.find((item) => item.id === itemId)?.data.locked
              ));

              if (movable.length === 0) return;

              hub.moveItems(movable, dx, dy);
              history.push({ kind: 'move', refs: movable.map(refOf), dx, dy });
            }}
            onCommit={(type, data, tempId) => {
              // Черновой ключ, под которым штрих уже рассылался, сохраняем:
              // по нему остальные заменят «рисуется» на «нарисовано».
              const ref = `s${tempId}`;
              pending.current.set(tempId, { ref, snapshot: { ref, type, data } });
              hub.commitItem(tempId, type, data);
            }}
            onCellAt={editCell}
            onErase={eraseAt}
            onEraseEnd={() => erased.current.clear()}
            onDrawStart={() => setShowParams(false)}
            onTextAt={(world) => {
              // Вид подвигаем только на узком экране и только когда для
              // поля не хватает места. На большом экране места хватает
              // всегда, и прыжок вида там просто дёргал бы холст.
              setViewport((current) => {
                if (canvasSize.width >= 720) return current;

                const screen = toScreen(current, world.x, world.y);
                const tight = screen.x > canvasSize.width - 160
                  || screen.y > canvasSize.height - 120
                  || screen.x < 8 || screen.y < 8;

                return tight
                  ? centerOn(current, world.x, world.y, canvasSize.width, canvasSize.height)
                  : current;
              });

              setTextAt(world);
            }}
          />

          {showTimer ? <TimerPanel onClose={() => setShowTimer(false)} /> : null}
          {showHelp ? <HelpPanel onClose={() => setShowHelp(false)} /> : null}

          {showFiles ? (
            <FilesPanel
              onInsert={insertImage}
              onSpread={spreadPage}
              canSpread={hub.canManage}
              onClose={() => setShowFiles(false)}
            />
          ) : null}

          {showLibrary && hub.canEdit ? (
            <LibraryPanel
              onInsert={insertTemplate}
              onInsertItems={insertItems}
              onText={pasteText}
              // Картинки в заготовку не идут: файл принадлежит своей доске.
              selection={selectedItems
                .filter((item) => item.type !== 'image')
                .map((item) => ({ type: item.type, data: item.data }))}
              canKeep={state?.me.isGuest === false}
              onClose={() => setShowLibrary(false)}
            />
          ) : null}

          {showPages ? (
            <PagesPanel
              pages={hub.pages}
              pageId={hub.pageId}
              participants={hub.participants}
              meKey={hub.participants.find((one) => one.connectionId === hub.me)?.key ?? null}
              canManage={hub.canManage}
              onOpen={(pageId) => {
                // Уходим со страницы — выделение с неё не переносим:
                // на новой этих объектов нет.
                setSelection([]);
                hub.openPage(pageId);
              }}
              onAdd={() => hub.addPage()}
              onRename={hub.renamePage}
              onDelete={hub.deletePage}
              onReorder={hub.reorderPages}
              onVisibility={hub.setPageVisibility}
              onClose={() => setShowPages(false)}
            />
          ) : null}

          {showBackground && hub.canManage ? (
            <BackgroundPanel
              value={hub.background}
              onChange={hub.setBackground}
              onClose={() => setShowBackground(false)}
            />
          ) : null}

          {showParams ? (
            <ToolSettingsPanel
              tool={tool}
              settings={settings}
              onChange={setSettings}
              onClose={() => setShowParams(false)}
            />
          ) : null}

          {/* Панель над выделением прячется, пока его тащат: она бы
              прыгала следом и мешала целиться. */}
          {selectionBounds && hub.canEdit ? (
            <SelectionPanel
              items={selectedItems}
              bounds={selectionBounds}
              viewport={viewport}
              canvas={canvasSize}
              onColor={recolorSelection}
              onDuplicate={duplicateSelection}
              onDelete={removeSelection}
              onReorder={(toFront) => hub.reorder(selection, toFront)}
              onCopyText={(text) => {
                navigator.clipboard?.writeText(text).catch(() => (
                  setError('Скопировать не вышло — браузер не дал доступ к буферу.')
                ));
              }}
              onDone={() => setSelection([])}
              onLock={lockSelection}
              onCopy={copySelection}
              onTable={(rows, cols) => {
                const item = selectedItems[0];
                if (item) hub.updateItem(item.id, resizedTable(item.data, rows, cols));
              }}
            />
          ) : null}

          {cellEdit ? (
            <TextInput
              at={cellEdit.at}
              viewport={viewport}
              bounds={canvasSize}
              settings={{
                color: tableItem?.data.color ?? settings.table.color,
                fontSize: tableItem?.data.fontSize ?? settings.table.fontSize,
              }}
              initial={tableItem
                ? (tableItem.type === 'shape'
                  ? tableItem.data.label ?? ''
                  : cellText(tableItem.data, cellEdit.row, cellEdit.col))
                : ''}
              onCommit={commitCell}
              onCancel={() => setCellEdit(null)}
            />
          ) : null}

          {textAt ? (
            <TextInput
              at={textAt}
              viewport={viewport}
              bounds={canvasSize}
              settings={settings.text}
              onCommit={commitText}
              onCancel={() => setTextAt(null)}
            />
          ) : null}

          {hub.status !== 'ready' ? (
            <p className="canvas-status">
              {hub.status === 'failed'
                ? 'Связь с доской потеряна. Нарисованное сохранится, когда связь вернётся.'
                : hub.status === 'reconnecting'
                  ? 'Связь прервалась — восстанавливаем…'
                  : 'Подключаемся к доске…'}
            </p>
          ) : null}

          {hub.status === 'ready' && !hub.canEdit ? (
            <p className="canvas-status">Вы наблюдаете: доступны только просмотр и масштаб.</p>
          ) : null}

          <CanvasPanel open={showPeople} title="Участники" onClose={() => setShowPeople(false)}>
              <PeoplePanel
                boardId={id}
                canManage={board.canManage}
                members={members}
                guests={otherGuests}
                guestName={me.isGuest ? me.displayName : null}
                queue={queue}
                present={hub.participants}
                cursors={hub.cursors}
                onGoTo={goToCursor}
                meConnectionId={hub.me}
                onChanged={load}
              />
          </CanvasPanel>

          <div className="board-page__people-corner">
            {me.isGuest ? (
              <p className="guest-hint">Вы гость. <Link to="/login">Войти?</Link></p>
            ) : null}

            <button
              className="btn-tool btn-tool--wide"
              type="button"
              onClick={() => setShowPeople((current) => !current)}
              aria-pressed={showPeople}
              title="Участники"
            >
              <IconPeople />
              {/* Считаем подключённых сейчас, а не записанных в участники:
                  на занятии важно, кто здесь, а не кто когда-то заходил. */}
              <span>Участники{presentCount ? ` · ${presentCount}` : ''}</span>
              {queue.waiting.length > 0 ? (
                <span className="badge-dot" aria-label={`Ждут допуска: ${queue.waiting.length}`}>
                  {queue.waiting.length}
                </span>
              ) : null}
            </button>
          </div>
        </section>

        {me.isGuest ? (
          <p className="text-muted small">
            Вы на доске как гость — доска у вас не сохранится.{' '}
            <button className="btn-quiet btn-sm" type="button" onClick={leaveGuest}>Выйти</button>
          </p>
        ) : null}
      </div>

      {showLink && board.linkUrl ? (
        <Modal title="Ссылка на доску" onClose={() => setShowLink(false)}>
          <p className="text-muted small">Действует час, потом обновляется сама.</p>

          <div className="link-box link-box--stack">
            <input type="text" readOnly value={board.linkUrl} onFocus={(e) => e.target.select()} />
            <button className="btn-primary btn-block" type="button" onClick={() => copy(board.linkUrl!)}>
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>

          <div className="check" style={{ marginTop: 'var(--sp-5)' }}>
            <input
              id="autoAdmit"
              type="checkbox"
              checked={board.autoAdmit}
              onChange={toggleAutoAdmit}
            />
            <label htmlFor="autoAdmit">Впускать сразу, без спроса</label>
          </div>
          <p className="text-muted small">
            Пришедшие попадут на доску наблюдателями, минуя очередь.
          </p>

          <button
            className="btn-danger btn-block"
            type="button"
            onClick={reissue}
            style={{ marginTop: 'var(--sp-5)' }}
          >
            Выпустить новую ссылку
          </button>
          <p className="text-muted small">Прежняя перестанет работать сразу.</p>
        </Modal>
      ) : null}
    </BoardShell>
  );
}
