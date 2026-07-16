import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plant, PlantUnit, Split } from '../model/plant';
import { PILE } from '../model/plant';
import { addUnit, addFeed, setLayout, clearLayout, connect, disconnect, portsOf } from '../model/plantOps';
import type { PlantResult } from '../engine/plant';
import { sieveLabel } from '../model/sieves';
import { symbol, STROKE } from './equipment';
import { UnitCard } from './unitCards';

const W = 132; // node width
const H = 92; // node height
const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

type Pos = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** Product-pile key that a given output port feeds (mirrors the engine). */
function portKey(u: PlantUnit, port: string): string {
  if (u.kind === 'feed') return `feed:${u.id}`;
  if (u.kind === 'crusher') return `crush:${u.css}`;
  if (port === 'under') return `under:${u.decks[u.decks.length - 1].aperture}`;
  return `over:${u.decks[Number(port.split(':')[1])].aperture}`;
}
const portLabel = (u: PlantUnit, port: string): string => {
  if (u.kind === 'feed') return 'feed';
  if (u.kind === 'crusher') return 'crushed';
  if (port === 'under') return `−${sieveLabel(u.decks[u.decks.length - 1].aperture)}`;
  return `+${sieveLabel(u.decks[Number(port.split(':')[1])].aperture)}`;
};
const routesOfPort = (u: PlantUnit, port: string): Split => {
  if (u.kind === 'feed' || u.kind === 'crusher') return u.out;
  if (port === 'under') return u.underTarget;
  return u.deckTargets[Number(port.split(':')[1])] ?? [{ to: PILE, frac: 1 }];
};

export function Flowsheet({ plant, result, onChange }: { plant: Plant; result: PlantResult; onChange: (p: Plant) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeById = useMemo(() => new Map(result.nodes.map((n) => [n.id, n])), [result]);

  // --- node positions: saved layout, else a left→right layered auto-layout ----
  const pos = useMemo(() => {
    const layout = plant.layout ?? {};
    const unitTargets = (u: PlantUnit): string[] => {
      if (u.kind === 'feed' || u.kind === 'crusher') return u.out.map((r) => r.to);
      return [...u.deckTargets.flatMap((dt) => dt.map((r) => r.to)), ...u.underTarget.map((r) => r.to)];
    };
    // Column = shortest distance from the feed along forward links (BFS).
    const col = new Map<string, number>();
    const queue: string[] = [];
    plant.units.filter((u) => u.kind === 'feed').forEach((f) => { col.set(f.id, 0); queue.push(f.id); });
    while (queue.length) {
      const id = queue.shift()!;
      const u = plant.units.find((x) => x.id === id);
      if (!u) continue;
      for (const t of unitTargets(u)) {
        if (t === PILE || col.has(t) || !plant.units.some((x) => x.id === t)) continue;
        col.set(t, (col.get(id) ?? 0) + 1);
        queue.push(t);
      }
    }
    let maxCol = 0;
    col.forEach((c) => (maxCol = Math.max(maxCol, c)));
    plant.units.forEach((u) => { if (!col.has(u.id)) col.set(u.id, ++maxCol); }); // disconnected → append

    // Piles sit one column right of the units that feed them.
    const pileCol = new Map<string, number>();
    plant.units.forEach((u) => {
      portsOf(u).forEach((port) => {
        const routes = routesOfPort(u, port);
        if (routes.some((r) => r.to === PILE || !plant.units.some((x) => x.id === r.to))) {
          const k = portKey(u, port);
          pileCol.set(k, Math.max(pileCol.get(k) ?? 0, (col.get(u.id) ?? 0) + 1));
        }
      });
    });

    const COLW = W + 96, ROWH = H + 44;
    const rowNext = new Map<number, number>();
    const place = (c: number) => { const r = rowNext.get(c) ?? 0; rowNext.set(c, r + 1); return { x: 40 + c * COLW, y: 40 + r * ROWH }; };
    const m = new Map<string, Pos>();
    [...plant.units].sort((a, b) => (col.get(a.id)! - col.get(b.id)!)).forEach((u) => {
      m.set(u.id, layout[u.id] ?? place(col.get(u.id)!));
    });
    result.piles.forEach((p) => {
      const k = `pile:${p.key}`;
      m.set(k, layout[k] ?? place(pileCol.get(p.key) ?? maxCol + 1));
    });
    return m;
  }, [plant, result]);

  const bounds = useMemo((): Box => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pos.forEach((p) => {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + W); y1 = Math.max(y1, p.y + H);
    });
    if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 600, h: 400 };
    return { x: x0 - 40, y: y0 - 40, w: x1 - x0 + 80, h: y1 - y0 + 80 };
  }, [pos]);

  const [view, setView] = useState<Box>(bounds);
  const [fitNonce, setFitNonce] = useState(0);
  // Re-frame everything when the SET of nodes changes (add / split / remove) or
  // when the user asks to fit/auto-arrange — so a new branch never lands
  // off-screen. Dragging a node changes positions (bounds) but not the node set,
  // so it doesn't trigger a re-fit and never fights the drag.
  const structureKey = plant.units.map((u) => u.id).join(',') + '|' + result.piles.map((p) => p.key).join(',');
  const lastFit = useRef({ key: structureKey, nonce: 0 });
  useEffect(() => {
    if (lastFit.current.key !== structureKey || lastFit.current.nonce !== fitNonce) {
      lastFit.current = { key: structureKey, nonce: fitNonce };
      setView(bounds);
    }
  }, [structureKey, fitNonce, bounds]);
  const [selected, setSelected] = useState<{ kind: 'unit' | 'edge'; id: string; from?: string; port?: string; target?: string } | null>(null);
  const [tempEnd, setTempEnd] = useState<Pos | null>(null);
  const drag = useRef<
    | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { mode: 'node'; id: string; ox: number; oy: number; moved: boolean }
    | { mode: 'connect'; id: string; port: string }
    | null
  >(null);

  const toWorld = (clientX: number, clientY: number): Pos => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const w = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: w.x, y: w.y };
  };
  const scale = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width ? view.w / r.width : 1;
  };

  const fit = () => setView(bounds);
  const zoom = (factor: number, cx?: number, cy?: number) => {
    const c = cx != null && cy != null ? toWorld(cx, cy) : { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    setView((v) => ({ x: c.x - (c.x - v.x) * factor, y: c.y - (c.y - v.y) * factor, w: v.w * factor, h: v.h * factor }));
  };

  // hit-test a world point against unit boxes
  const unitAt = (p: Pos): string | null => {
    for (const u of plant.units) {
      const q = pos.get(u.id)!;
      if (p.x >= q.x && p.x <= q.x + W && p.y >= q.y && p.y <= q.y + H) return u.id;
    }
    return null;
  };

  const onPointerDownBg = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    setSelected(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    const q = pos.get(id)!;
    drag.current = { mode: 'node', id, ox: w.x - q.x, oy: w.y - q.y, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPortDown = (e: React.PointerEvent, id: string, port: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = { mode: 'connect', id, port };
    setTempEnd(toWorld(e.clientX, e.clientY));
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const s = scale();
      setView((v) => ({ ...v, x: d.vx - (e.clientX - d.sx) * s, y: d.vy - (e.clientY - d.sy) * s }));
    } else if (d.mode === 'node') {
      const w = toWorld(e.clientX, e.clientY);
      d.moved = true;
      onChange(setLayout(plant, d.id, { x: Math.round(w.x - d.ox), y: Math.round(w.y - d.oy) }));
    } else if (d.mode === 'connect') {
      setTempEnd(toWorld(e.clientX, e.clientY));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'node' && !d.moved) {
      setSelected({ kind: 'unit', id: d.id });
    } else if (d.mode === 'connect') {
      const w = toWorld(e.clientX, e.clientY);
      const hit = unitAt(w);
      const target = hit && hit !== d.id ? hit : PILE;
      onChange(connect(plant, d.id, d.port, target));
      setTempEnd(null);
    }
  };

  const centerPos = () => ({ x: Math.round(view.x + view.w / 2 - W / 2), y: Math.round(view.y + view.h / 2 - H / 2) });
  const addAt = (kind: 'screen' | 'crusher') => {
    const { plant: next, id } = addUnit(plant, kind, centerPos());
    onChange(next);
    setSelected({ kind: 'unit', id });
  };
  const addFeedAt = () => {
    const { plant: next, id } = addFeed(plant, centerPos());
    onChange(next);
    setSelected({ kind: 'unit', id });
  };

  // --- edges ------------------------------------------------------------------
  type Edge = { id: string; from: string; port: string; toKey: string; a: Pos; b: Pos; tph: number; recycle: boolean };
  const edges: Edge[] = [];
  const portTotal = (u: PlantUnit, port: string): number => {
    const n = nodeById.get(u.id);
    if (u.kind === 'feed') return u.tph;
    if (u.kind === 'crusher') return n && n.kind === 'crusher' ? n.output.tph : 0;
    if (n && n.kind === 'screen') return port === 'under' ? n.result.undersize.tph : n.result.products[Number(port.split(':')[1])]?.stream.tph ?? 0;
    return 0;
  };
  const anchorRight = (id: string, k: number, total: number): Pos => {
    const q = pos.get(id)!;
    return { x: q.x + W, y: q.y + 18 + (total > 1 ? (k * (H - 30)) / (total - 1) : (H - 30) / 2) };
  };
  const anchorLeft = (id: string): Pos => {
    const q = pos.get(id)!;
    return { x: q.x, y: q.y + H / 2 };
  };
  plant.units.forEach((u) => {
    const ports = portsOf(u);
    ports.forEach((port, k) => {
      const routes = routesOfPort(u, port);
      const sum = routes.reduce((a, r) => a + (r.frac > 0 ? r.frac : 0), 0) || 1;
      const a = anchorRight(u.id, k, ports.length);
      routes.forEach((r) => {
        if (r.frac <= 0) return;
        const tph = portTotal(u, port) * (r.frac / sum);
        const toUnit = r.to !== PILE && plant.units.some((x) => x.id === r.to);
        const toKey = toUnit ? r.to : `pile:${portKey(u, port)}`;
        if (!pos.has(toKey)) return;
        // A link back to a unit at or left of the source is a recycle loop.
        const recycle = toUnit && pos.get(r.to)!.x <= pos.get(u.id)!.x;
        const b = anchorLeft(toKey);
        edges.push({ id: `${u.id}|${port}|${r.to}`, from: u.id, port, toKey: r.to, a, b, tph, recycle });
      });
    });
  });

  const selUnit = selected?.kind === 'unit' ? plant.units.find((u) => u.id === selected.id) : undefined;
  if (selected?.kind === 'unit' && !selUnit) setSelected(null); // unit was deleted

  // Delete / Backspace removes the selected link (unless you're typing in the
  // inspector). Deleting a link to a pile caps that port, so the pile goes too.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      const t = ev.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (selected?.kind === 'edge' && selected.from && selected.port && selected.target != null) {
        ev.preventDefault();
        onChange(disconnect(plant, selected.from, selected.port, selected.target));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, plant, onChange]);

  // Clean node-editor edges: horizontal tangents off the right output into the
  // target's left face. Recycle loops bow downward so they read as a return line.
  const edgePath = (e: Edge) => {
    if (e.recycle) {
      const bow = 60 + Math.abs(e.a.y - e.b.y) * 0.15;
      return `M ${e.a.x} ${e.a.y} C ${e.a.x + 44} ${e.a.y + bow}, ${e.b.x - 44} ${e.b.y + bow}, ${e.b.x} ${e.b.y}`;
    }
    const k = Math.max(28, Math.min(110, Math.abs(e.b.x - e.a.x) * 0.5));
    return `M ${e.a.x} ${e.a.y} C ${e.a.x + k} ${e.a.y}, ${e.b.x - k} ${e.b.y}, ${e.b.x} ${e.b.y}`;
  };

  return (
    <div className="fs-wrap">
      <div className="fs-toolbar">
        <button className="secondary" onClick={() => addAt('screen')}>+ Screen</button>
        <button className="secondary" onClick={() => addAt('crusher')}>+ Crusher</button>
        <button className="secondary" onClick={addFeedAt}>+ Feed</button>
        <span className="fs-tb-gap" />
        <button className="secondary fs-zoom" onClick={() => zoom(1 / 1.2)} title="Zoom in" aria-label="zoom in">+</button>
        <button className="secondary fs-zoom" onClick={() => zoom(1.2)} title="Zoom out" aria-label="zoom out">−</button>
        <button className="secondary" onClick={fit} title="Fit to view">Fit</button>
        <button className="secondary" onClick={() => { onChange(clearLayout(plant)); setFitNonce((n) => n + 1); }} title="Auto-arrange">Auto-arrange</button>
        <span className="fs-hint">Drag boxes to arrange · drag a ● output to another box (or empty space = pile) to wire it · click a box to edit · click a link then ✕ (or press Delete) to remove it — removing a link to a pile removes the pile too</span>
      </div>

      <div className="fs-body">
        <svg
          ref={svgRef}
          className="fs-canvas"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerDown={onPointerDownBg}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <defs>
            <marker id="fs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#9aa4b0" />
            </marker>
          </defs>

          {edges.map((e) => {
            const on = selected?.kind === 'edge' && selected.id === e.id;
            return (
              <g key={e.id}>
                <path d={edgePath(e)} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }}
                  onPointerDown={(ev) => { ev.stopPropagation(); setSelected({ kind: 'edge', id: e.id, from: e.from, port: e.port, target: e.toKey }); }} />
                <path d={edgePath(e)} fill="none" stroke={on ? '#d9480f' : e.recycle ? '#b58bd8' : '#9aa4b0'} strokeWidth={on ? 2.4 : 1.6}
                  strokeDasharray={e.recycle ? '5 4' : undefined} markerEnd="url(#fs-arrow)" />
                {e.tph > 0.5 && <text x={(e.a.x + e.b.x) / 2} y={(e.a.y + e.b.y) / 2 - 3 + (e.recycle ? 42 : 0)} className="fs-edge-label" textAnchor="middle">{round(e.tph)} tph</text>}
                {on && (
                  <g transform={`translate(${(e.a.x + e.b.x) / 2} ${(e.a.y + e.b.y) / 2})`} style={{ cursor: 'pointer' }}
                    onPointerDown={(ev) => { ev.stopPropagation(); onChange(disconnect(plant, e.from, e.port, e.toKey)); setSelected(null); }}>
                    <circle r={9} fill="#fff" stroke="#d9480f" strokeWidth={1.5} />
                    <text className="fs-x" textAnchor="middle" y={3.5}>✕</text>
                  </g>
                )}
              </g>
            );
          })}

          {tempEnd && drag.current?.mode === 'connect' && (() => {
            const dc = drag.current;
            const u = plant.units.find((x) => x.id === dc.id);
            if (!u) return null;
            const ports = portsOf(u);
            const a = anchorRight(u.id, ports.indexOf(dc.port), ports.length);
            return <line className="fs-temp-edge" x1={a.x} y1={a.y} x2={tempEnd.x} y2={tempEnd.y} markerEnd="url(#fs-arrow)" />;
          })()}

          {/* pile nodes */}
          {result.piles.map((p) => {
            const q = pos.get(`pile:${p.key}`)!;
            return (
              <g key={p.key} transform={`translate(${q.x} ${q.y})`}>
                <g transform={`translate(${W / 2} 34)`}>{symbol('stockpile', 3)}</g>
                <text x={W / 2} y={66} className="fs-node-name" textAnchor="middle">{p.product}</text>
                <text x={W / 2} y={80} className="fs-node-sub" textAnchor="middle">{round(p.stream.tph)} tph</text>
              </g>
            );
          })}

          {/* unit nodes */}
          {plant.units.map((u) => {
            const q = pos.get(u.id)!;
            const n = nodeById.get(u.id);
            const bad = (n?.kind === 'screen' && !n.result.ok) || (n?.kind === 'crusher' && n.overCapacity);
            const sel = selected?.kind === 'unit' && selected.id === u.id;
            const ports = portsOf(u);
            const sub = u.kind === 'feed' ? `${round(u.tph)} tph`
              : u.kind === 'screen' && n?.kind === 'screen' ? `${round(n.input.tph)} tph`
              : u.kind === 'crusher' && n?.kind === 'crusher' ? `${round(n.input.tph)} tph · ${n.reductionRatio.toFixed(1)}:1` : '';
            return (
              <g key={u.id} transform={`translate(${q.x} ${q.y})`}>
                <rect className={`fs-node-box ${sel ? 'sel' : ''} ${bad ? 'bad' : ''}`} x={0} y={0} width={W} height={H} rx={12}
                  style={{ cursor: 'grab' }} onPointerDown={(e) => onNodeDown(e, u.id)} />
                <g transform={`translate(${W / 2} 34)`} style={{ pointerEvents: 'none' }}>
                  {symbol(u.kind === 'feed' ? 'feed' : u.kind === 'screen' ? 'screen' : 'crusher', u.kind === 'screen' ? u.decks.length : 3)}
                </g>
                <text x={W / 2} y={66} className="fs-node-name" textAnchor="middle" style={{ pointerEvents: 'none' }}>{u.name}</text>
                <text x={W / 2} y={80} className="fs-node-sub" textAnchor="middle" style={{ pointerEvents: 'none' }} fill={bad ? STROKE.crusher : undefined}>{sub}</text>
                {/* output ports on the right edge */}
                {ports.map((port, k) => {
                  const py = 18 + (ports.length > 1 ? (k * (H - 30)) / (ports.length - 1) : (H - 30) / 2);
                  return (
                    <g key={port} style={{ cursor: 'crosshair' }} onPointerDown={(e) => onPortDown(e, u.id, port)}>
                      <circle className="fs-port" cx={W} cy={py} r={5} />
                      <title>{portLabel(u, port)} →</title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {selUnit && (
          <aside className="fs-inspector">
            <div className="fs-insp-head">
              <strong>Edit {selUnit.kind}</strong>
              <button className="link-btn" onClick={() => setSelected(null)}>close ✕</button>
            </div>
            <UnitCard plant={plant} u={selUnit} node={nodeById.get(selUnit.id)} onChange={onChange} />
          </aside>
        )}
      </div>
    </div>
  );
}
