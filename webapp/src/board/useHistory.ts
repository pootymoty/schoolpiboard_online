import { useCallback, useRef, useState } from 'react';
import type { ItemData, ItemType } from './protocol';

/** Снимок объекта, достаточный чтобы создать его заново. */
export interface ItemSnapshot {
  /** Устойчивая ссылка. Номер на сервере меняется при пересоздании, эта — нет. */
  ref: string;
  type: ItemType;
  data: ItemData;
}

/** Что было сделано. Отмена — обратное действие, а не откат к снимку. */
export type Operation =
  | { kind: 'create'; items: ItemSnapshot[] }
  | { kind: 'delete'; items: ItemSnapshot[] }
  | { kind: 'move'; refs: string[]; dx: number; dy: number };

interface Actions {
  /** Создать заново под той же ссылкой. */
  restore: (snapshot: ItemSnapshot) => void;
  move: (refs: string[], dx: number, dy: number) => void;
  remove: (refs: string[]) => void;
}

export interface History {
  canUndo: boolean;
  canRedo: boolean;
  push: (operation: Operation) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

/** Глубже не храним: доска живёт долго, а память браузера — нет. */
const LIMIT = 100;

/**
 * Отмена и повтор своих действий.
 *
 * Отменяется только своё: доска общая, и откат к общему снимку стирал бы
 * заодно то, что за это время нарисовали другие.
 *
 * История хранит устойчивые ссылки, а не номера объектов. Восстановленный
 * объект получает от сервера новый номер, и записи, ссылавшиеся на
 * прежний, стали бы указывать в пустоту; ссылка же переживает любое
 * количество отмен и повторов.
 */
export function useHistory(actions: Actions): History {
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });

  const past = useRef<Operation[]>([]);
  const future = useRef<Operation[]>([]);

  const sync = useCallback(() => {
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);

  const push = useCallback((operation: Operation) => {
    past.current = [...past.current, operation].slice(-LIMIT);
    // Новое действие обрывает ветку повтора: продолжать её было бы
    // продолжением истории, которой уже не случилось.
    future.current = [];
    sync();
  }, [sync]);

  const undo = useCallback(() => {
    const operation = past.current.at(-1);
    if (!operation) return;

    past.current = past.current.slice(0, -1);

    if (operation.kind === 'create') {
      actions.remove(operation.items.map((item) => item.ref));
    } else if (operation.kind === 'delete') {
      for (const item of operation.items) actions.restore(item);
    } else {
      actions.move(operation.refs, -operation.dx, -operation.dy);
    }

    future.current = [...future.current, operation];
    sync();
  }, [actions, sync]);

  const redo = useCallback(() => {
    const operation = future.current.at(-1);
    if (!operation) return;

    future.current = future.current.slice(0, -1);

    if (operation.kind === 'create') {
      for (const item of operation.items) actions.restore(item);
    } else if (operation.kind === 'delete') {
      actions.remove(operation.items.map((item) => item.ref));
    } else {
      actions.move(operation.refs, operation.dx, operation.dy);
    }

    past.current = [...past.current, operation];
    sync();
  }, [actions, sync]);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    sync();
  }, [sync]);

  return { canUndo: depth.undo > 0, canRedo: depth.redo > 0, push, undo, redo, clear };
}
