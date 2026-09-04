import { measureText } from './handles';
import { GRID_STEP } from './snap';
import type { ItemData, ItemType } from './protocol';

/**
 * Библиотека заготовок.
 *
 * Заготовка — не особый объект доски, а набор обычных: линий, эллипсов и
 * надписей. Это сделано намеренно. Отдельный тип «координатная плоскость»
 * пришлось бы учить рисоваться, тянуться, поворачиваться, резаться
 * ластиком и переживать все будущие правки протокола; здесь же
 * вставленное сразу ведёт себя как всё остальное — по нему пишут, часть
 * стирают, ось передвигают, лишнюю подпись удаляют.
 *
 * Расплата — количество объектов: плоскость с подписями это полсотни
 * штук. Для доски с пределом в двадцать тысяч это немного, а взамен
 * учитель правит чертёж, а не борется с ним.
 *
 * Настройки задаются до вставки, а не после: пересобирать уже
 * исправленный вручную чертёж по новому числу делений — значит стирать
 * чужую правку.
 */

export interface Draft {
  type: ItemType;
  data: ItemData;
}

/** Ручка настройки. Ползунок для числа, галочка для «да/нет». */
export interface Knob {
  key: string;
  label: string;
  kind: 'number' | 'toggle';
  min: number;
  max: number;
  suffix?: string;
}

export type TemplateGroup = 'axes' | 'solid';

/**
 * Куда и чем вставлять.
 *
 * Размер задаётся стороной квадрата в мировых единицах — его считает
 * доска по видимой части холста: заготовка должна занимать примерно то
 * же место на экране при любом масштабе.
 */
export interface Frame {
  cx: number;
  cy: number;
  size: number;
  color: string;
  width: number;
  fontSize: number;
}

export interface Template {
  id: string;
  title: string;
  group: TemplateGroup;
  hint: string;
  knobs: Knob[];
  defaults: Record<string, number>;
  build: (frame: Frame, params: Record<string, number>) => Draft[];
}

interface Pt {
  x: number;
  y: number;
}

/* ── Кирпичи ─────────────────────────────────────────────────────── */

function segment(frame: Frame, a: Pt, b: Pt, hidden = false): Draft {
  return {
    type: 'shape',
    data: {
      shape: 'line',
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: frame.color,
      width: frame.width,
      // Невидимый ребро — пунктиром: так его чертят в учебнике, и так
      // сразу видно, что фигура объёмная, а не плоская.
      lineStyle: hidden ? 'dash' : 'solid',
    },
  };
}

function ray(frame: Frame, a: Pt, b: Pt): Draft {
  return {
    type: 'shape',
    data: {
      shape: 'arrow',
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: frame.color,
      width: frame.width,
      lineStyle: 'solid',
    },
  };
}

function oval(frame: Frame, at: Pt, rx: number, ry: number, hidden = false): Draft {
  return {
    type: 'shape',
    data: {
      shape: 'ellipse',
      x1: at.x - rx,
      y1: at.y - ry,
      x2: at.x + rx,
      y2: at.y + ry,
      color: frame.color,
      width: frame.width,
      lineStyle: hidden ? 'dash' : 'solid',
    },
  };
}

/** Половина эллипса. Ближняя половина сплошная, дальняя пунктиром. */
function halfOval(frame: Frame, at: Pt, rx: number, ry: number, half: 'up' | 'down', hidden = false): Draft {
  return {
    type: 'shape',
    data: {
      shape: half === 'up' ? 'arcUp' : 'arcDown',
      x1: at.x - rx,
      y1: at.y - ry,
      x2: at.x + rx,
      y2: at.y + ry,
      color: frame.color,
      width: frame.width,
      lineStyle: hidden ? 'dash' : 'solid',
    },
  };
}

/**
 * Надпись. Координата — куда её тянет, а не левый верхний угол: подписи
 * на чертеже ставят по центру засечки или сбоку от неё, и считать
 * смещение в каждом месте отдельно значило бы промахиваться.
 */
function caption(
  frame: Frame, at: Pt, text: string, anchor: 'center' | 'left' | 'right', fontSize = frame.fontSize,
): Draft {
  const box = measureText(text, fontSize);
  const dx = anchor === 'center' ? -box.width / 2 : anchor === 'right' ? -box.width : 0;
  const x1 = at.x + dx;
  const y1 = at.y - box.height / 2;

  return {
    type: 'text',
    data: {
      x1,
      y1,
      x2: x1 + box.width,
      y2: y1 + box.height,
      text,
      fontSize,
      color: frame.color,
      width: 1,
    },
  };
}

/* ── Координаты ──────────────────────────────────────────────────── */

/**
 * Шаг деления, кратный клетке доски.
 *
 * Прилипание и разлиновка ходят шагом в тридцать две единицы, и ось,
 * размеченная своим шагом, разошлась бы с клеткой на второй засечке:
 * ровное на глаз оказалось бы кривым по клеткам.
 */
function unitFor(size: number, divisions: number): number {
  const raw = size / (2 * divisions + 1.6);
  return Math.max(GRID_STEP, Math.round(raw / GRID_STEP) * GRID_STEP);
}

function origin(frame: Frame): Pt {
  return {
    x: Math.round(frame.cx / GRID_STEP) * GRID_STEP,
    y: Math.round(frame.cy / GRID_STEP) * GRID_STEP,
  };
}

const PLANE: Template = {
  id: 'plane',
  title: 'Координатная плоскость',
  group: 'axes',
  hint: 'Оси с засечками по клеткам доски. Саму клетку включают в «Фоне» — разлиновка «График».',
  knobs: [
    { key: 'divisions', label: 'Делений по оси', kind: 'number', min: 2, max: 12 },
    { key: 'labels', label: 'Подписи делений', kind: 'toggle', min: 0, max: 1 },
  ],
  defaults: { divisions: 5, labels: 1 },
  build: (frame, params) => {
    const n = Math.round(params.divisions);
    const unit = unitFor(frame.size, n);
    const at = origin(frame);
    const reach = n * unit + unit * 0.7;
    const tick = Math.max(4, unit * 0.16);
    const small = Math.max(11, frame.fontSize * 0.8);

    const drafts: Draft[] = [
      ray(frame, { x: at.x - reach, y: at.y }, { x: at.x + reach, y: at.y }),
      ray(frame, { x: at.x, y: at.y + reach }, { x: at.x, y: at.y - reach }),
    ];

    for (let i = 1; i <= n; i += 1) {
      for (const sign of [1, -1]) {
        const x = at.x + sign * i * unit;
        const y = at.y + sign * i * unit;

        drafts.push(segment(frame, { x, y: at.y - tick }, { x, y: at.y + tick }));
        drafts.push(segment(frame, { x: at.x - tick, y }, { x: at.x + tick, y }));

        if (params.labels) {
          // Число под осью и слева от неё: там, где его ищут глазами, и
          // там, где оно не налезет на нарисованное в первой четверти.
          drafts.push(caption(frame, { x, y: at.y + tick + small }, String(sign * i), 'center', small));
          drafts.push(caption(
            frame, { x: at.x - tick - small * 0.4, y }, String(-sign * i), 'right', small,
          ));
        }
      }
    }

    drafts.push(caption(frame, { x: at.x - small * 0.7, y: at.y + small * 0.9 }, 'O', 'right', small));
    drafts.push(caption(frame, { x: at.x + reach, y: at.y - small }, 'x', 'center', small));
    drafts.push(caption(frame, { x: at.x + small, y: at.y - reach }, 'y', 'left', small));

    return drafts;
  },
};

const NUMBER_LINE: Template = {
  id: 'number-line',
  title: 'Числовая прямая',
  group: 'axes',
  hint: 'Прямая с нулём и засечками — под сравнение чисел, дроби и модуль.',
  knobs: [
    { key: 'divisions', label: 'Делений в каждую сторону', kind: 'number', min: 2, max: 12 },
    { key: 'labels', label: 'Подписи делений', kind: 'toggle', min: 0, max: 1 },
  ],
  defaults: { divisions: 5, labels: 1 },
  build: (frame, params) => {
    const n = Math.round(params.divisions);
    const unit = unitFor(frame.size, n);
    const at = origin(frame);
    const reach = n * unit + unit * 0.7;
    const tick = Math.max(5, unit * 0.2);
    const small = Math.max(11, frame.fontSize * 0.8);

    const drafts: Draft[] = [
      ray(frame, { x: at.x - reach, y: at.y }, { x: at.x + reach, y: at.y }),
      segment(frame, { x: at.x, y: at.y - tick }, { x: at.x, y: at.y + tick }),
      caption(frame, { x: at.x, y: at.y + tick + small }, '0', 'center', small),
    ];

    for (let i = 1; i <= n; i += 1) {
      for (const sign of [1, -1]) {
        const x = at.x + sign * i * unit;
        drafts.push(segment(frame, { x, y: at.y - tick }, { x, y: at.y + tick }));
        if (params.labels) {
          drafts.push(caption(frame, { x, y: at.y + tick + small }, String(sign * i), 'center', small));
        }
      }
    }

    return drafts;
  },
};

/* ── Объёмные фигуры ─────────────────────────────────────────────── */

interface Vertex {
  at: Pt;
  /** Вершина спрятана телом фигуры — рёбра при ней чертят пунктиром. */
  hidden: boolean;
}

/**
 * Вершины основания в наклонной проекции.
 *
 * Основание — правильный многоугольник, увиденный сверху под углом, то
 * есть вписанный в сплюснутый эллипс. Спрятана та вершина, которая
 * оказалась на дальней половине и при этом не на самом краю: край — это
 * силуэт, его видно всегда, а всё, что внутри силуэта и сзади, закрыто
 * телом фигуры. По этому же правилу у тетраэдра пунктиром выходят ровно
 * три ребра при дальней вершине — как в учебнике.
 */
function baseVertices(center: Pt, rx: number, ry: number, sides: number): Vertex[] {
  const angles: number[] = [];
  for (let k = 0; k < sides; k += 1) angles.push(-Math.PI / 2 + (2 * Math.PI * k) / sides);

  const edge = Math.max(...angles.map((angle) => Math.abs(Math.cos(angle))));

  return angles.map((angle) => ({
    at: { x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) },
    hidden: Math.sin(angle) < -1e-6 && Math.abs(Math.cos(angle)) < edge - 1e-6,
  }));
}

const BOX: Template = {
  id: 'box',
  title: 'Параллелепипед',
  group: 'solid',
  hint: 'Куб получается, если высота и глубина равны ширине.',
  knobs: [
    { key: 'height', label: 'Высота', kind: 'number', min: 30, max: 140, suffix: '% ширины' },
    { key: 'depth', label: 'Глубина', kind: 'number', min: 10, max: 70, suffix: '% ширины' },
  ],
  defaults: { height: 70, depth: 35 },
  build: (frame, params) => {
    const width = frame.size * 0.62;
    const height = (width * params.height) / 100;
    const depth = (width * params.depth) / 100;

    const left = frame.cx - (width + depth) / 2;
    const top = frame.cy - (height + depth) / 2 + depth;

    // Передняя грань, по часовой стрелке от левого верхнего угла.
    const d = { x: left, y: top };
    const c = { x: left + width, y: top };
    const b = { x: left + width, y: top + height };
    const a = { x: left, y: top + height };

    const shift = (point: Pt): Pt => ({ x: point.x + depth, y: point.y - depth });
    const [da, ca, ba, aa] = [shift(d), shift(c), shift(b), shift(a)];

    return [
      segment(frame, d, c),
      segment(frame, c, b),
      segment(frame, b, a),
      segment(frame, a, d),

      segment(frame, da, ca),
      segment(frame, ca, ba),
      segment(frame, ba, aa, true),
      segment(frame, aa, da, true),

      segment(frame, d, da),
      segment(frame, c, ca),
      segment(frame, b, ba),
      segment(frame, a, aa, true),
    ];
  },
};

/** Призма и пирамида собираются одинаково — различаются только верхом. */
function standing(
  frame: Frame, sides: number, heightPercent: number, top: 'base' | 'apex',
): Draft[] {
  const rx = frame.size * 0.34;
  const ry = rx * 0.34;
  const height = (frame.size * heightPercent) / 100;

  const bottom = baseVertices({ x: frame.cx, y: frame.cy + height / 2 }, rx, ry, sides);
  const drafts: Draft[] = [];

  for (let k = 0; k < sides; k += 1) {
    const next = (k + 1) % sides;
    drafts.push(segment(frame, bottom[k].at, bottom[next].at, bottom[k].hidden || bottom[next].hidden));
  }

  if (top === 'apex') {
    const apex = { x: frame.cx, y: frame.cy - height / 2 };
    for (const vertex of bottom) drafts.push(segment(frame, vertex.at, apex, vertex.hidden));
    return drafts;
  }

  const upper = baseVertices({ x: frame.cx, y: frame.cy - height / 2 }, rx, ry, sides);

  for (let k = 0; k < sides; k += 1) {
    // Верхнее основание видно целиком: на фигуру смотрят сверху.
    drafts.push(segment(frame, upper[k].at, upper[(k + 1) % sides].at));
    drafts.push(segment(frame, bottom[k].at, upper[k].at, bottom[k].hidden));
  }

  return drafts;
}

const PRISM: Template = {
  id: 'prism',
  title: 'Призма',
  group: 'solid',
  hint: 'Основание — правильный многоугольник. Четыре угла дают прямую призму на ромбическом основании.',
  knobs: [
    { key: 'sides', label: 'Углов в основании', kind: 'number', min: 3, max: 8 },
    { key: 'height', label: 'Высота', kind: 'number', min: 30, max: 130, suffix: '% размера' },
  ],
  defaults: { sides: 6, height: 80 },
  build: (frame, params) => standing(frame, Math.round(params.sides), params.height, 'base'),
};

const PYRAMID: Template = {
  id: 'pyramid',
  title: 'Пирамида',
  group: 'solid',
  hint: 'Правильная пирамида с вершиной над серединой основания.',
  knobs: [
    { key: 'sides', label: 'Углов в основании', kind: 'number', min: 3, max: 8 },
    { key: 'height', label: 'Высота', kind: 'number', min: 30, max: 130, suffix: '% размера' },
  ],
  defaults: { sides: 4, height: 85 },
  build: (frame, params) => standing(frame, Math.round(params.sides), params.height, 'apex'),
};

const TETRAHEDRON: Template = {
  id: 'tetrahedron',
  title: 'Тетраэдр',
  group: 'solid',
  hint: 'Пирамида на треугольном основании: дальнее ребро идёт пунктиром.',
  knobs: [
    { key: 'height', label: 'Высота', kind: 'number', min: 40, max: 140, suffix: '% размера' },
  ],
  defaults: { height: 90 },
  build: (frame, params) => standing(frame, 3, params.height, 'apex'),
};

const SPHERE: Template = {
  id: 'sphere',
  title: 'Шар',
  group: 'solid',
  hint: 'Окружность с экватором: ближняя половина сплошная, дальняя пунктиром.',
  knobs: [
    { key: 'tilt', label: 'Наклон экватора', kind: 'number', min: 8, max: 50, suffix: '% радиуса' },
    { key: 'radius', label: 'Показать радиус', kind: 'toggle', min: 0, max: 1 },
  ],
  defaults: { tilt: 26, radius: 0 },
  build: (frame, params) => {
    const r = frame.size * 0.34;
    const ry = (r * params.tilt) / 100;
    const at = { x: frame.cx, y: frame.cy };

    const drafts: Draft[] = [
      oval(frame, at, r, r),
      halfOval(frame, at, r, ry, 'down'),
      halfOval(frame, at, r, ry, 'up', true),
    ];

    if (params.radius) {
      const end = { x: at.x + r * 0.71, y: at.y - r * 0.71 };
      drafts.push(segment(frame, at, end));
      drafts.push(caption(frame, { x: (at.x + end.x) / 2 - frame.fontSize * 0.6, y: (at.y + end.y) / 2 }, 'R', 'right'));
    }

    return drafts;
  },
};

const CYLINDER: Template = {
  id: 'cylinder',
  title: 'Цилиндр',
  group: 'solid',
  hint: 'Нижнее основание чертится наполовину пунктиром — оно за телом.',
  knobs: [
    { key: 'height', label: 'Высота', kind: 'number', min: 30, max: 150, suffix: '% размера' },
    { key: 'tilt', label: 'Наклон основания', kind: 'number', min: 12, max: 45, suffix: '% радиуса' },
  ],
  defaults: { height: 85, tilt: 30 },
  build: (frame, params) => {
    const rx = frame.size * 0.3;
    const ry = (rx * params.tilt) / 100;
    const height = (frame.size * params.height) / 100;

    const top = { x: frame.cx, y: frame.cy - height / 2 };
    const bottom = { x: frame.cx, y: frame.cy + height / 2 };

    return [
      oval(frame, top, rx, ry),
      halfOval(frame, bottom, rx, ry, 'down'),
      halfOval(frame, bottom, rx, ry, 'up', true),
      segment(frame, { x: top.x - rx, y: top.y }, { x: bottom.x - rx, y: bottom.y }),
      segment(frame, { x: top.x + rx, y: top.y }, { x: bottom.x + rx, y: bottom.y }),
    ];
  },
};

const CONE: Template = {
  id: 'cone',
  title: 'Конус',
  group: 'solid',
  hint: 'Вершина над серединой основания; дальняя половина основания пунктиром.',
  knobs: [
    { key: 'height', label: 'Высота', kind: 'number', min: 40, max: 160, suffix: '% размера' },
    { key: 'tilt', label: 'Наклон основания', kind: 'number', min: 12, max: 45, suffix: '% радиуса' },
  ],
  defaults: { height: 100, tilt: 30 },
  build: (frame, params) => {
    const rx = frame.size * 0.3;
    const ry = (rx * params.tilt) / 100;
    const height = (frame.size * params.height) / 100;

    const apex = { x: frame.cx, y: frame.cy - height / 2 };
    const bottom = { x: frame.cx, y: frame.cy + height / 2 };

    return [
      halfOval(frame, bottom, rx, ry, 'down'),
      halfOval(frame, bottom, rx, ry, 'up', true),
      segment(frame, apex, { x: bottom.x - rx, y: bottom.y }),
      segment(frame, apex, { x: bottom.x + rx, y: bottom.y }),
    ];
  },
};

export const TEMPLATES: Template[] = [
  PLANE, NUMBER_LINE,
  BOX, PRISM, PYRAMID, TETRAHEDRON, SPHERE, CYLINDER, CONE,
];

export const TEMPLATE_GROUPS: { kind: TemplateGroup; title: string }[] = [
  { kind: 'axes', title: 'Координаты' },
  { kind: 'solid', title: 'Объёмные фигуры' },
];

/** Значения ручек по умолчанию для всех заготовок сразу. */
export function defaultParams(): Record<string, Record<string, number>> {
  return Object.fromEntries(TEMPLATES.map((one) => [one.id, { ...one.defaults }]));
}

/* ── Математические знаки ────────────────────────────────────────── */

/**
 * Знаки и формулы вставляются обычной надписью.
 *
 * Клавиатуры формул здесь намеренно нет: набирать дробь этажами на доске
 * посреди объяснения дольше, чем написать её рукой. Нужен ровно тот
 * случай, когда знака нет на клавиатуре, — и тогда его берут отсюда.
 */
export interface SymbolRow {
  title: string;
  items: string[];
}

export const MATH_SYMBOLS: SymbolRow[] = [
  {
    title: 'Действия и сравнение',
    items: ['·', '×', '÷', '±', '∓', '≠', '≈', '≡', '≤', '≥', '≪', '≫', '√', '∛', '∞', '‰', '%'],
  },
  {
    title: 'Степени и индексы',
    items: ['⁰', '¹', '²', '³', '⁴', 'ⁿ', '₀', '₁', '₂', '₃', 'ₙ', '′', '″'],
  },
  {
    title: 'Множества и логика',
    items: ['∈', '∉', '⊂', '⊆', '⊄', '∪', '∩', '∅', 'ℕ', 'ℤ', 'ℚ', 'ℝ', '∀', '∃', '⇒', '⇔', '¬'],
  },
  {
    title: 'Геометрия',
    items: ['°', '∠', '⊥', '∥', '△', '□', '≅', '∼', '⌒', '↔', '→', '⊙'],
  },
  {
    title: 'Анализ',
    items: ['∑', '∏', '∫', '∂', '∆', '∇', 'lim', '→', '≐', 'd', '′'],
  },
  {
    title: 'Греческие',
    items: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Δ', 'Σ', 'Ω'],
  },
];

export interface FormulaRow {
  title: string;
  items: { label: string; text: string }[];
}

export const FORMULAS: FormulaRow[] = [
  {
    title: 'Алгебра',
    items: [
      { label: 'Квадрат суммы', text: '(a + b)² = a² + 2ab + b²' },
      { label: 'Квадрат разности', text: '(a − b)² = a² − 2ab + b²' },
      { label: 'Разность квадратов', text: 'a² − b² = (a − b)(a + b)' },
      { label: 'Сумма кубов', text: 'a³ + b³ = (a + b)(a² − ab + b²)' },
      { label: 'Разность кубов', text: 'a³ − b³ = (a − b)(a² + ab + b²)' },
      { label: 'Дискриминант', text: 'D = b² − 4ac' },
      { label: 'Корни квадратного', text: 'x₁,₂ = (−b ± √D) / 2a' },
      { label: 'Теорема Виета', text: 'x₁ + x₂ = −b/a,  x₁ · x₂ = c/a' },
      { label: 'Степени', text: 'aⁿ · aᵐ = aⁿ⁺ᵐ,  (aⁿ)ᵐ = aⁿᵐ' },
      { label: 'Логарифм', text: 'log_a(xy) = log_a x + log_a y' },
    ],
  },
  {
    title: 'Геометрия',
    items: [
      { label: 'Теорема Пифагора', text: 'a² + b² = c²' },
      { label: 'Площадь треугольника', text: 'S = ½ · a · h' },
      { label: 'Площадь круга', text: 'S = πR²' },
      { label: 'Длина окружности', text: 'C = 2πR' },
      { label: 'Объём параллелепипеда', text: 'V = a · b · c' },
      { label: 'Объём призмы', text: 'V = S_осн · h' },
      { label: 'Объём пирамиды', text: 'V = ⅓ · S_осн · h' },
      { label: 'Объём цилиндра', text: 'V = πR²h' },
      { label: 'Объём конуса', text: 'V = ⅓ · πR²h' },
      { label: 'Объём шара', text: 'V = ⁴⁄₃ · πR³' },
      { label: 'Площадь сферы', text: 'S = 4πR²' },
    ],
  },
  {
    title: 'Тригонометрия',
    items: [
      { label: 'Основное тождество', text: 'sin²α + cos²α = 1' },
      { label: 'Тангенс', text: 'tg α = sin α / cos α' },
      { label: 'Синус суммы', text: 'sin(α + β) = sin α cos β + cos α sin β' },
      { label: 'Косинус суммы', text: 'cos(α + β) = cos α cos β − sin α sin β' },
      { label: 'Двойной угол', text: 'sin 2α = 2 sin α cos α' },
      { label: 'Теорема синусов', text: 'a / sin A = b / sin B = c / sin C' },
      { label: 'Теорема косинусов', text: 'c² = a² + b² − 2ab · cos C' },
    ],
  },
  {
    title: 'Физика',
    items: [
      { label: 'Скорость', text: 'v = s / t' },
      { label: 'Плотность', text: 'ρ = m / V' },
      { label: 'Второй закон Ньютона', text: 'F = m · a' },
      { label: 'Работа', text: 'A = F · s' },
      { label: 'Кинетическая энергия', text: 'E = mv² / 2' },
      { label: 'Закон Ома', text: 'I = U / R' },
    ],
  },
];
