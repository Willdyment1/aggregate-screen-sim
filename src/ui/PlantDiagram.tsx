import { PILE, type Plant, type Split } from '../model/plant';
import { sieveLabel } from '../model/sieves';
import type { PlantResult } from '../engine/plant';
import { symbol, STROKE } from './equipment';

// Flowsheet of the routed plant drawn with equipment icons (feed hopper, screen,
// cone crusher, stockpile cones) and labelled arrows. Units run down a column,
// product piles sit to the right, recycle loops bow out to the left.
const COLW = 150; // unit column width
const ROW = 158; // vertical spacing between units
const TOP = 44; // top padding (room for the feed hopper's top line)
const LEFTPAD = 66; // room for recycle loops on the left
const PILEGAP = 120; // gap between the unit column and the pile column
const PILEW = 150;
const PILEROW = 78;
const ICON_HALF = 30; // icon reaches ~±30 vertically, ~±48 horizontally

const tph = (n: number) => `${Math.round(n)} tph`;

interface OutRoute {
  port: string;
  target: string;
  streamTph: number;
  pileLabel: string;
}

export function PlantDiagram({ plant, result, compact }: { plant: Plant; result: PlantResult; compact?: boolean }) {
  const nodeById = new Map(result.nodes.map((n) => [n.id, n]));
  const unitCX = LEFTPAD + COLW / 2;
  const unitPos = new Map<string, { x: number; y: number }>();
  plant.units.forEach((u, i) => unitPos.set(u.id, { x: unitCX, y: TOP + ICON_HALF + i * ROW }));

  const pileCX = LEFTPAD + COLW + PILEGAP + PILEW / 2;

  // One arrow per route: a split port fans out, each getting its share of the tph.
  const fan = (routes: Split, total: number, port: string, pileLabel: string): OutRoute[] => {
    const rs = routes && routes.length ? routes : [{ to: PILE, frac: 1 }];
    const sum = rs.reduce((a, r) => a + (r.frac > 0 ? r.frac : 0), 0) || 1;
    return rs
      .filter((r) => r.frac > 0)
      .map((r, k) => ({ port: `${port}-${k}`, target: r.to, streamTph: total * (r.frac / sum), pileLabel }));
  };

  const outputsOf = (u: Plant['units'][number]): OutRoute[] => {
    if (u.kind === 'feed') return fan(u.out, u.tph, 'out', 'feed');
    const n = nodeById.get(u.id);
    if (u.kind === 'crusher') {
      return fan(u.out, n && n.kind === 'crusher' ? n.output.tph : 0, 'out', 'crushed');
    }
    if (u.kind !== 'screen') return []; // pile: a sink, no outputs
    const outs: OutRoute[] = u.decks.flatMap((d, di) =>
      fan(u.deckTargets[di] ?? [{ to: PILE, frac: 1 }], n && n.kind === 'screen' ? n.result.products[di]?.stream.tph ?? 0 : 0, `deck-${di}`, `+${sieveLabel(d.aperture)}`),
    );
    outs.push(...fan(u.underTarget, n && n.kind === 'screen' ? n.result.undersize.tph : 0, 'undersize', `−${sieveLabel(u.decks[u.decks.length - 1].aperture)}`));
    return outs;
  };

  // Build edges + pile nodes.
  const piles: { id: string; x: number; y: number; label: string; streamTph: number }[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number; streamTph: number; recycle: boolean; pile: boolean }[] = [];
  let pileSlot = 0;
  for (const u of plant.units) {
    const src = unitPos.get(u.id)!;
    for (const o of outputsOf(u)) {
      const toUnit = o.target !== PILE && unitPos.has(o.target);
      if (toUnit) {
        const tgt = unitPos.get(o.target)!;
        const recycle = tgt.y <= src.y; // target at/above source → a recycle loop
        edges.push({
          x1: recycle ? src.x - 46 : src.x,
          y1: recycle ? src.y : src.y + ICON_HALF,
          x2: recycle ? tgt.x - 46 : tgt.x,
          y2: recycle ? tgt.y : tgt.y - ICON_HALF,
          streamTph: o.streamTph,
          recycle,
          pile: false,
        });
      } else {
        const py = TOP + pileSlot * PILEROW;
        pileSlot++;
        piles.push({ id: `${u.id}-${o.port}`, x: pileCX, y: py + 24, label: o.pileLabel, streamTph: o.streamTph });
        edges.push({ x1: src.x + 46, y1: src.y, x2: pileCX - 34, y2: py + 24, streamTph: o.streamTph, recycle: false, pile: true });
      }
    }
  }

  const width = pileCX + PILEW / 2 + 14;
  const height = Math.max(TOP + ICON_HALF + plant.units.length * ROW, TOP + pileSlot * PILEROW) + 20;

  const edgePath = (e: (typeof edges)[number]) => {
    if (e.recycle) {
      const bx = LEFTPAD - 44;
      return `M ${e.x1} ${e.y1} C ${bx} ${e.y1}, ${bx} ${e.y2}, ${e.x2} ${e.y2}`;
    }
    if (e.pile) return `M ${e.x1} ${e.y1} C ${e.x1 + 44} ${e.y1}, ${e.x2 - 34} ${e.y2}, ${e.x2} ${e.y2}`;
    return `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + 26}, ${e.x2} ${e.y2 - 26}, ${e.x2} ${e.y2}`;
  };

  return (
    <div className="chart-scroll plant-diagram-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`plant-diagram flow-canvas${compact ? ' compact' : ''}`}
        role="img"
        style={{ minWidth: Math.min(width, compact ? 320 : 520) }}
      >
        <defs>
          <marker id="pd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#9aa4b0" />
          </marker>
        </defs>

        {edges.map((e, i) => (
          <g key={i}>
            <path
              d={edgePath(e)}
              fill="none"
              stroke={e.recycle ? '#b58bd8' : '#9aa4b0'}
              strokeWidth={1.6}
              strokeDasharray={e.recycle ? '5 4' : undefined}
              markerEnd="url(#pd-arrow)"
            />
            {e.streamTph > 0.5 && !compact && (e.pile || e.recycle) && (
              // Only label product (pile) and recycle-loop arrows — the main
              // forward flow tph is already on each unit's caption.
              <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 3} className="pd-edge-label" textAnchor="middle">
                {tph(e.streamTph)}
              </text>
            )}
          </g>
        ))}

        {plant.units.map((u) => {
          const pos = unitPos.get(u.id)!;
          const n = nodeById.get(u.id);
          const bad = (n?.kind === 'screen' && !n.result.ok) || (n?.kind === 'crusher' && n.overCapacity) || false;
          let sub = '';
          if (u.kind === 'feed') sub = tph(u.tph);
          else if (u.kind === 'screen' && n?.kind === 'screen') sub = `${tph(n.input.tph)} · ${n.result.ok ? 'OK' : 'overloaded'}`;
          else if (u.kind === 'crusher' && n?.kind === 'crusher') sub = `${tph(n.input.tph)} · ${n.reductionRatio.toFixed(1)}:1${n.overCapacity ? ' · over cap' : ''}`;
          return (
            <g key={u.id} transform={`translate(${pos.x} ${pos.y})`}>
              {bad && <rect x={-56} y={-38} width={112} height={98} rx={12} className="pd-bad-halo" />}
              {symbol(u.kind === 'feed' ? 'feed' : u.kind === 'screen' ? 'screen' : 'crusher', u.kind === 'screen' ? u.decks.length : 3)}
              <text x={0} y={44} className="pd-node-name" textAnchor="middle">
                {u.name}
              </text>
              <text x={0} y={60} className="pd-node-sub" textAnchor="middle" fill={bad ? STROKE.crusher : undefined}>
                {sub}
              </text>
            </g>
          );
        })}

        {piles.map((p) => (
          <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
            {symbol('stockpile', 3)}
            <text x={0} y={40} className="pd-pile-name" textAnchor="middle">
              {p.label}
            </text>
            {!compact && (
              <text x={0} y={55} className="pd-pile-sub" textAnchor="middle">
                {tph(p.streamTph)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
