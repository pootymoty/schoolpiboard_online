import type { ReactElement } from 'react';
import type { LineStyle, ShapeKind } from './protocol';

/**
 * Значки фигур и типов линии.
 *
 * Образцом, а не словом: «трапеция» и «параллелограмм» рядом читаются
 * медленнее, чем различаются на вид, а «штрихпунктир» словом вообще не
 * опознаётся без примера.
 */
function Svg({ children }: { children: ReactElement }): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      {children}
    </svg>
  );
}

export function ShapeIcon({ kind }: { kind: ShapeKind }): ReactElement {
  switch (kind) {
    case 'line':
      return <Svg><path d="M4 19L20 5" /></Svg>;
    case 'arrow':
      return <Svg><g><path d="M4 19L20 5" /><path d="M20 11V5h-6" /></g></Svg>;
    case 'ellipse':
      return <Svg><ellipse cx="12" cy="12" rx="9" ry="6.5" /></Svg>;
    case 'triangle':
      return <Svg><path d="M12 4L21 20H3z" /></Svg>;
    case 'trapezoid':
      return <Svg><path d="M7 5h10l4 14H3z" /></Svg>;
    case 'parallelogram':
      return <Svg><path d="M8 5h13l-5 14H3z" /></Svg>;
    case 'rhombus':
      return <Svg><path d="M12 3l9 9-9 9-9-9z" /></Svg>;
    default:
      return <Svg><rect x="3" y="6" width="18" height="12" rx="1" /></Svg>;
  }
}

export function LineStyleIcon({ kind }: { kind: LineStyle }): ReactElement {
  const dash = {
    solid: undefined,
    dash: '7 4',
    dashdot: '7 3 1 3',
    dot: '1 4',
  }[kind];

  return (
    <svg width="34" height="22" viewBox="0 0 34 22" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 11h28" strokeDasharray={dash} />
    </svg>
  );
}
