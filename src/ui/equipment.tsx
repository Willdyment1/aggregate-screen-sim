import type { JSX } from 'react';
import type { FlowNodeType } from '../model/types';

export type EquipKind = FlowNodeType;

export const STROKE: Record<EquipKind, string> = {
  feed: '#3b7dd8',
  crusher: '#d9640f',
  screen: '#1f9d55',
  stockpile: '#8a6d3b',
  conveyor: '#6b48b8',
  note: '#8a7b3b',
};
export const FILL: Record<EquipKind, string> = {
  feed: '#e8f0fb',
  crusher: '#fbe7d6',
  screen: '#e7f5ec',
  stockpile: '#f3ead0',
  conveyor: '#efeafb',
  note: '#fffbe6',
};

export const KIND_LIST: { kind: EquipKind; label: string }[] = [
  { kind: 'feed', label: 'Feed' },
  { kind: 'crusher', label: 'Crusher' },
  { kind: 'screen', label: 'Screen' },
  { kind: 'stockpile', label: 'Stockpile' },
  { kind: 'conveyor', label: 'Conveyor' },
  { kind: 'note', label: 'Note' },
];

/** Draw a recognizable equipment symbol centred on the origin. */
export function symbol(kind: EquipKind, decks = 3): JSX.Element {
  const s = STROKE[kind];
  const f = FILL[kind];
  switch (kind) {
    case 'feed':
      return (
        <g strokeLinejoin="round">
          <line x1={-44} y1={-26} x2={44} y2={-26} stroke={s} strokeWidth={4} />
          <polygon points="-40,-24 40,-24 15,18 -15,18" fill={f} stroke={s} strokeWidth={2} />
          <line x1={-26} y1={-16} x2={-16} y2={-16} stroke={s} strokeWidth={1.5} opacity={0.5} />
          <line x1={-8} y1={-16} x2={12} y2={-16} stroke={s} strokeWidth={1.5} opacity={0.5} />
          <rect x={-9} y={18} width={18} height={9} fill={s} />
        </g>
      );
    case 'crusher':
      return (
        <g strokeLinejoin="round">
          <line x1={-42} y1={-24} x2={42} y2={-24} stroke={s} strokeWidth={4} />
          <path d="M -38 -22 L -18 18 L 18 18 L 38 -22" fill={f} stroke={s} strokeWidth={2} />
          <polygon points="0,-18 14,14 -14,14" fill={s} opacity={0.85} />
          <rect x={-9} y={18} width={18} height={8} fill={s} />
        </g>
      );
    case 'screen': {
      const lines = [];
      const n = Math.max(1, Math.min(4, decks));
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        lines.push(
          <line
            key={i}
            x1={-46}
            y1={-20 + t * 20}
            x2={46}
            y2={-6 + t * 20}
            stroke={s}
            strokeWidth={1.5}
            strokeDasharray="3 2"
            opacity={0.8}
          />,
        );
      }
      return (
        <g strokeLinejoin="round">
          <polygon points="-48,-20 48,-6 48,14 -48,0" fill={f} stroke={s} strokeWidth={2} />
          {lines}
          <line x1={-34} y1={4} x2={-40} y2={28} stroke={s} strokeWidth={2} />
          <line x1={34} y1={12} x2={40} y2={28} stroke={s} strokeWidth={2} />
          <line x1={-46} y1={28} x2={46} y2={28} stroke={s} strokeWidth={2} />
        </g>
      );
    }
    case 'stockpile':
      return (
        <g strokeLinejoin="round">
          <polygon points="0,-24 34,20 -34,20" fill={f} stroke={s} strokeWidth={2} />
          <line x1={-12} y1={10} x2={12} y2={10} stroke={s} strokeWidth={1.3} opacity={0.4} />
          <line x1={-20} y1={17} x2={20} y2={17} stroke={s} strokeWidth={1.3} opacity={0.4} />
          <line x1={-42} y1={20} x2={42} y2={20} stroke={s} strokeWidth={2} />
        </g>
      );
    case 'conveyor':
      return (
        <g strokeLinejoin="round">
          <line x1={-36} y1={9} x2={36} y2={-9} stroke={s} strokeWidth={15} opacity={0.18} strokeLinecap="round" />
          <line x1={-36} y1={9} x2={36} y2={-9} stroke={s} strokeWidth={2} strokeDasharray="5 3" />
          <circle cx={-36} cy={9} r={8} fill={f} stroke={s} strokeWidth={2} />
          <circle cx={36} cy={-9} r={8} fill={f} stroke={s} strokeWidth={2} />
        </g>
      );
    case 'note':
      return (
        <g strokeLinejoin="round">
          <rect x={-42} y={-24} width={84} height={48} rx={3} fill={f} stroke={s} strokeWidth={1.5} />
          <path d="M 28 -24 L 42 -24 L 42 -10 Z" fill="#f4ecc0" stroke={s} strokeWidth={1} />
          <line x1={-32} y1={-8} x2={26} y2={-8} stroke={s} strokeWidth={1} opacity={0.4} />
          <line x1={-32} y1={2} x2={26} y2={2} stroke={s} strokeWidth={1} opacity={0.4} />
          <line x1={-32} y1={12} x2={10} y2={12} stroke={s} strokeWidth={1} opacity={0.4} />
        </g>
      );
  }
}
