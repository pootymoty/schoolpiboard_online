import type { LineStyle, ShapeKind } from './protocol';

export type Tool = 'select' | 'hand' | 'pen1' | 'pen2' | 'marker' | 'eraser' | 'shapes' | 'text';

/** Инструменты, которые оставляют след: у каждого своя панель параметров. */
export const DRAWING_TOOLS: Tool[] = ['pen1', 'pen2', 'marker', 'eraser', 'shapes', 'text'];

/** Размеры пера — те же шесть, что в десктопной версии. */
export const SIZES = [1, 5, 10, 15, 20, 30];

/** Прозрачность в процентах. */
export const OPACITIES = [20, 40, 50, 70, 100];

/** Размеры ластика. */
export const ERASER_SIZES = [8, 16, 26, 60, 120];

export const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'line', label: 'Линия' },
  { kind: 'arrow', label: 'Стрелка' },
  { kind: 'rect', label: 'Прямоугольник' },
  { kind: 'ellipse', label: 'Эллипс' },
  { kind: 'triangle', label: 'Треугольник' },
  { kind: 'trapezoid', label: 'Трапеция' },
  { kind: 'parallelogram', label: 'Параллелограмм' },
  { kind: 'rhombus', label: 'Ромб' },
];

export const LINE_STYLES: { kind: LineStyle; label: string }[] = [
  { kind: 'solid', label: 'Сплошная' },
  { kind: 'dash', label: 'Штрих' },
  { kind: 'dashdot', label: 'Штрихпунктир' },
  { kind: 'dot', label: 'Пунктир' },
];

/**
 * Палитра. Восемь цветов: набор из сотни оттенков заставляет выбирать
 * вместо того, чтобы объяснять.
 */
export const PALETTE = [
  '#2A211C', '#7F8C8D', '#B03A2E', '#E67E22',
  '#B7950B', '#1E8449', '#1F618D', '#8E44AD',
];

export interface PenSettings {
  color: string;
  width: number;
  /** В процентах, как в панели. В объект уходит долей единицы. */
  opacity: number;
}

export interface ShapeSettings extends PenSettings {
  shape: ShapeKind;
  lineStyle: LineStyle;
}

export interface TextSettings {
  color: string;
  fontSize: number;
}

/**
 * Настройки всех инструментов сразу.
 *
 * Перо 1, Перо 2 и Маркер — три независимых набора: у каждого свой цвет,
 * толщина и прозрачность. В этом и смысл двух перьев — переключаться
 * между двумя настройками, а не перенастраивать одно.
 */
export interface ToolSettings {
  pen1: PenSettings;
  pen2: PenSettings;
  marker: PenSettings;
  shapes: ShapeSettings;
  text: TextSettings;
  eraser: { size: number };
}

export const DEFAULT_SETTINGS: ToolSettings = {
  pen1: { color: '#2A211C', width: 5, opacity: 100 },
  pen2: { color: '#B03A2E', width: 5, opacity: 100 },
  // Маркер полупрозрачен и толст по умолчанию — им выделяют, а не пишут.
  marker: { color: '#B7950B', width: 20, opacity: 40 },
  shapes: { color: '#1F618D', width: 5, opacity: 100, shape: 'rect', lineStyle: 'solid' },
  text: { color: '#2A211C', fontSize: 24 },
  eraser: { size: 26 },
};

/** Цвет, которым инструмент рисует сейчас — для точки на его кнопке. */
export function toolColor(tool: Tool, settings: ToolSettings): string | null {
  if (tool === 'pen1' || tool === 'pen2' || tool === 'marker') return settings[tool].color;
  if (tool === 'shapes') return settings.shapes.color;
  if (tool === 'text') return settings.text.color;
  return null;
}
