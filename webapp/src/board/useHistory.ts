import { useCallback, useRef, useState } from 'react';
import type { ItemData, ItemType } from './protocol';

/** Что было сделано. Отмена — обратное действие, а не откат к снимку. */
export type Operation =
  | { kind: 'create'; itemIds: number[] }
  | { kind: 'move'; itemIds: number[]; dx: number; dy: number }
  | { kind: 'delete'; items: { type: ItemType; data: ItemData }[] };

interface Actions {
  create: (type: ItemType, data: ItemData) => void;
  move: (itemIds: number[], dx: number, dy: number) => void;
  remove: (itemIds: number[]) => void;
}

export interface History {
  canUndo: boolean;
  canRedo: boolean;
  /** Запомнить сделанное. Повтор при этом сбрасывается — ветка истории новая. */
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
 * Восстановленный после отмены объект получает новый идентификатор —
 * старого на сервере уже нет. Поэтому записи, ссылавшиеся на прежний
 * идентификатор, из истории убираются: отменять то, чего больше нет,
 * значило бы отменять чужое.
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
    future.current = [];
    sync();
  }, [sync]);

  /** Убирает из истории всё, что ссылается на исчезнувшие объекты. */
  const forget = useCallback((itemIds: number[]) => {
    const gone = new Set(itemIds);
    const alive = (operation: Operation) => (
      operation.kind === 'delete'
      || !operation.itemIds.some((id) => gone.has(id))
    );

    past.current = past.current.filter(alive);
    future.current = future.current.filter(alive);
  }, []);

  const undo = useCallback(() => {
    const operation = past.current.at(-1);
    if (!operation) return;

    past.current = past.current.slice(0, -1);

    if (operation.kind === 'create') {
      actions.remove(operation.itemIds);
    } else if (operation.kind === 'move') {
      actions.move(operation.itemIds, -operation.dx, -operation.dy);
    } else {
      for (const item of operation.items) actions.create(item.type, item.data);
    }

    if (operation.kind === 'create') forget(operation.itemIds);

    // Повторить можно только перемещение. Создание и удаление меняют
    // состав объектов, и отменённое возвращается уже под новым номером —
    // повтор ссылался бы на тот, которого больше нет.
    if (operation.kind === 'move') {
      future.current = [...future.current, operation];
    } else {
      future.current = [];
    }

    sync();
  }, [actions, forget, sync]);

  const redo = useCallback(() => {
    const operation = future.current.at(-1);
    if (!operation || operation.kind !== 'move') return;

    future.current = future.current.slice(0, -1);
    actions.move(operation.itemIds, operation.dx, operation.dy);
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
