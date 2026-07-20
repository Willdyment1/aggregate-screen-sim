import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plant, PlantUnit, Split } from '../model/plant';
import { PILE, MERGE } from '../model/plant';
import { addUnit, addFeed, addPile, removeUnit, setLayout, clearLayout, connect, disconnect, portsOf, mergeSinkPort, isMergeSplit } from '../model/plantOps';
import type { PlantResult } from '../engine/plant';
import { sizeAtPassing } from '../engine/gradation';
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
  if (u.kind === 'crusher') return `crush:${u.crusherType ?? 'cone'}:${u.css}`;
  if (u.kind !== 'screen') return '';
  if (port === 'under') return `under:${u.decks[u.decks.length - 1].aperture}`;
  return `over:${u.decks[Number(port.split(':')[1])].aperture}`;
}
const portLabel = (u: PlantUnit, port: string): string => {
  if (u.kind === 'feed') return 'feed';
  if (u.kind === 'crusher') return 'crushed';
  if (u.kind !== 'screen') return '';
  if (port === 'under') return `−${sieveLabel(u.decks[u.decks.length - 1].aperture)}`;
  return `+${sieveLabel(u.decks[Number(port.split(':')[1])].aperture)}`;
};
const routesOfPort = (u: PlantUnit, port: string): Split => {
  if (u.kind === 'feed' || u.kind === 'crusher') return u.out;
  if (u.kind !== 'screen') return [];
  if (port === 'under') return u.underTarget;
  return u.deckTargets[Number(port.split(':')[1])] ?? [{ to: PILE, frac: 1 }];
};

export function Flowsheet({ plant, result, onChange }: { plant: Plant; result: PlantResult; onChange: (p: Plant) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeById = useMemo(() => new Map(result.nodes.map((n) => [n.id, n])), [result]);

  // --- node positions: saved layout, else a left→right layered auto-layout that
  // orders each column to keep the wiring untangled (barycentre / median sweeps,
  // the core of Sugiyama-style graph drawing) --------------------------------
  const pos = useMemo(() => {
    const layout = plant.layout ?? {};
    const unitIds = new Set(plant.units.map((u) => u.id));
    const unitTargets = (u: PlantUnit): string[] => {
      if (u.kind === 'feed' || u.kind === 'crusher') return u.out.map((r) => r.to);
      if (u.kind !== 'screen') return [];
      return [...u.deckTargets.flatMap((dt) => dt.map((r) => r.to)), ...u.underTarget.map((r) => r.to)];
    };

    // Column (layer) = shortest forward distance from a feed (BFS). Recycle
    // back-links are skipped here so a loop doesn't collapse the columns.
    const col = new Map<string, number>();
    const queue: string[] = [];
    plant.units.filter((u) => u.kind === 'feed').forEach((f) => { col.set(f.id, 0); queue.push(f.id); });
    while (queue.length) {
      const id = queue.shift()!;
      const u = plant.units.find((x) => x.id === id);
      if (!u) continue;
      for (const t of unitTargets(u)) {
        if (t === PILE || col.has(t) || !unitIds.has(t)) continue;
        col.set(t, (col.get(id) ?? 0) + 1);
        queue.push(t);
      }
    }
    let maxCol = 0;
    col.forEach((c) => (maxCol = Math.max(maxCol, c)));
    plant.units.forEach((u) => { if (!col.has(u.id)) col.set(u.id, ++maxCol); }); // disconnected → append

    // Every node = a unit or an auto product pile. (Explicit stockpiles are real
    // units, already positioned above; only auto-piles need placing here.)
    const autoPiles = result.piles.filter((p) => !p.key.startsWith('pileunit:'));
    const pilePresent = new Set(autoPiles.map((p) => `pile:${p.key}`));
    const nodeCol = new Map<string, number>();
    plant.units.forEach((u) => nodeCol.set(u.id, col.get(u.id) ?? 0));
    plant.units.forEach((u) =>
      portsOf(u).forEach((port) => {
        if (routesOfPort(u, port).some((r) => r.to === PILE || !unitIds.has(r.to))) {
          const nk = `pile:${portKey(u, port)}`;
          if (pilePresent.has(nk)) nodeCol.set(nk, Math.max(nodeCol.get(nk) ?? 0, (col.get(u.id) ?? 0) + 1));
        }
      }),
    );
    autoPiles.forEach((p) => { const nk = `pile:${p.key}`; if (!nodeCol.has(nk)) nodeCol.set(nk, maxCol + 1); });

    // Directed links carrying the source's output-port offset (its height on the
    // box, in row units). Ordering/aligning by this — not just the box centre —
    // is what stops a box's several outputs from crossing on their way to piles.
    const ROWH = H + 40;
    type Lnk = { u: string; t: string; off: number };
    const links: Lnk[] = [];
    plant.units.forEach((u) => {
      const ports = portsOf(u);
      ports.forEach((port, r) => {
        const portY = 18 + (ports.length > 1 ? (r * (H - 30)) / (ports.length - 1) : (H - 30) / 2);
        const off = (portY - H / 2) / ROWH; // signed offset of this port from the box centre
        routesOfPort(u, port).forEach((route) => {
          if (route.frac <= 0) return;
          const tk = route.to !== PILE && unitIds.has(route.to) ? route.to : `pile:${portKey(u, port)}`;
          if (nodeCol.has(tk) && tk !== u.id) links.push({ u: u.id, t: tk, off });
        });
      });
    });

    // Group nodes per column; seed the order by feed/insertion order.
    const cols = new Map<number, string[]>();
    const push = (k: string) => { const c = nodeCol.get(k)!; (cols.get(c) ?? cols.set(c, []).get(c)!).push(k); };
    plant.units.forEach((u) => push(u.id));
    autoPiles.forEach((p) => push(`pile:${p.key}`));
    const colIdxs = [...cols.keys()].sort((a, b) => a - b);

    const idx = new Map<string, number>();
    const reindex = () => cols.forEach((arr) => arr.forEach((k, i) => idx.set(k, i)));
    reindex();

    // Mean neighbour position of a box, in `scale` units (idx rows, or pixels).
    // Each link's endpoints are offset by its source port height, so a box sits
    // level with the ports it wires to and its outputs order to match them.
    const meanPos = (k: string, at: (n: string) => number, scale: number): number | null => {
      let s = 0, n = 0;
      for (const l of links) {
        if (l.t === k) { s += at(l.u) + l.off * scale; n++; }
        if (l.u === k) { s += at(l.t) - l.off * scale; n++; }
      }
      return n ? s / n : null;
    };

    // 1) Order each column by the mean row of its neighbours (barycentre), a few
    //    sweeps in each direction — pulls connected boxes into line.
    for (let pass = 0; pass < 12; pass++) {
      for (const c of pass % 2 === 0 ? colIdxs : [...colIdxs].reverse()) {
        const arr = cols.get(c)!;
        const want = new Map(arr.map((k) => [k, meanPos(k, (n) => idx.get(n)!, 1) ?? idx.get(k)!]));
        arr.sort((p, q) => want.get(p)! - want.get(q)!);
        reindex();
      }
    }

    // 2) Transpose: greedily swap adjacent boxes whenever it removes a link
    //    crossing (the standard Sugiyama refinement barycentre alone misses).
    const crossings = (): number => {
      const groups = new Map<number, [number, number][]>();
      for (const l of links) {
        const cu = nodeCol.get(l.u)!, ct = nodeCol.get(l.t)!;
        if (Math.abs(cu - ct) !== 1) continue; // only adjacent-column links cross here
        const lo = Math.min(cu, ct);
        const left = cu < ct ? idx.get(l.u)! + l.off : idx.get(l.t)!;
        const right = cu < ct ? idx.get(l.t)! : idx.get(l.u)! + l.off;
        (groups.get(lo) ?? groups.set(lo, []).get(lo)!).push([left, right]);
      }
      let x = 0;
      groups.forEach((list) => {
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const [a1, b1] = list[i], [a2, b2] = list[j];
            if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) x++;
          }
      });
      return x;
    };
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (const c of colIdxs) {
        const arr = cols.get(c)!;
        for (let i = 0; i < arr.length - 1; i++) {
          const before = crossings();
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; idx.set(arr[i], i); idx.set(arr[i + 1], i + 1);
          if (crossings() < before) improved = true;
          else { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; idx.set(arr[i], i); idx.set(arr[i + 1], i + 1); }
        }
      }
      if (!improved) break;
    }

    // 3) Coordinates: pull each box toward the mean height of its neighbours,
    //    keep a minimum vertical gap in the fixed order, and recentre — straightens
    //    the links without reintroducing crossings.
    const y = new Map<string, number>();
    cols.forEach((arr) => arr.forEach((k, i) => y.set(k, i * ROWH)));
    const yMean = (k: string): number | null => meanPos(k, (n) => y.get(n)!, ROWH);
    for (let pass = 0; pass < 10; pass++) {
      for (const c of pass % 2 === 0 ? colIdxs : [...colIdxs].reverse()) {
        const arr = cols.get(c)!;
        const want = arr.map((k) => yMean(k) ?? y.get(k)!);
        const placed = want.slice();
        for (let i = 1; i < placed.length; i++) if (placed[i] < placed[i - 1] + ROWH) placed[i] = placed[i - 1] + ROWH;
        const shift = want.reduce((s, v) => s + v, 0) / want.length - placed.reduce((s, v) => s + v, 0) / placed.length;
        arr.forEach((k, i) => y.set(k, placed[i] + shift));
      }
    }

    const COLW = W + 108;
    const PX = (k: string) => 40 + nodeCol.get(k)! * COLW; // pre-pack x from the column

    // Split into connected components; keep the biggest (the main flow) in place
    // and pack the rest into a tidy grid below it. Otherwise a batch of unattached
    // units piles into one long strip and Fit has to zoom way out to show it.
    const keys = [...nodeCol.keys()];
    const parent = new Map(keys.map((k) => [k, k]));
    const find = (a: string): string => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a)!)!); a = parent.get(a)!; } return a; };
    links.forEach((l) => { const ra = find(l.u), rb = find(l.t); if (ra !== rb) parent.set(ra, rb); });
    const groups = new Map<string, string[]>();
    keys.forEach((k) => (groups.get(find(k)) ?? groups.set(find(k), []).get(find(k))!).push(k));
    const comps = [...groups.values()].sort((a, b) => b.length - a.length);
    const bbox = (ks: string[]) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ks.forEach((k) => { const x = PX(k), yy = y.get(k)!; x0 = Math.min(x0, x); y0 = Math.min(y0, yy); x1 = Math.max(x1, x + W); y1 = Math.max(y1, yy + H); });
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    };
    const tr = new Map<string, { dx: number; dy: number }>();
    const GAP = 60;
    const mb = comps.length ? bbox(comps[0]) : { x0: 0, y0: 0, w: 0, h: 0 };
    comps[0]?.forEach((k) => tr.set(k, { dx: 40 - mb.x0, dy: 40 - mb.y0 })); // main → origin (40,40)
    let rowX = 40, rowY = 40 + mb.h + GAP, rowH = 0;
    const budget = Math.max(mb.w, 900);
    for (let i = 1; i < comps.length; i++) {
      const cb = bbox(comps[i]);
      if (rowX > 40 && rowX + cb.w > 40 + budget) { rowX = 40; rowY += rowH + GAP; rowH = 0; }
      const dx = rowX - cb.x0, dy = rowY - cb.y0;
      comps[i].forEach((k) => tr.set(k, { dx, dy }));
      rowX += cb.w + GAP; rowH = Math.max(rowH, cb.h);
    }

    const m = new Map<string, Pos>();
    const setPos = (k: string) => { const t = tr.get(k) ?? { dx: 0, dy: 0 }; m.set(k, layout[k] ?? { x: Math.round(PX(k) + t.dx), y: Math.round(y.get(k)! + t.dy) }); };
    plant.units.forEach((u) => setPos(u.id));
    autoPiles.forEach((p) => setPos(`pile:${p.key}`));
    return m;
  }, [plant, result]);

  const bounds = useMemo((): Box => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, floor = -Infinity;
    pos.forEach((p) => {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + W); y1 = Math.max(y1, p.y + H);
      floor = Math.max(floor, p.y + H);
    });
    if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 600, h: 400 };
    // Recycle links route through a channel below the boxes — reserve room for it.
    const hasRecycle = plant.units.some((u) => {
      const su = pos.get(u.id);
      if (!su) return false;
      const outs = u.kind === 'feed' || u.kind === 'crusher' ? u.out.map((r) => r.to) : u.kind === 'screen' ? [...u.deckTargets.flatMap((dt) => dt.map((r) => r.to)), ...u.underTarget.map((r) => r.to)] : [];
      return outs.some((t) => { const tp = pos.get(t); return tp && tp.x <= su.x; });
    });
    if (hasRecycle) y1 = Math.max(y1, floor + 70);
    return { x: x0 - 40, y: y0 - 40, w: x1 - x0 + 80, h: y1 - y0 + 80 };
  }, [pos, plant]);

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
  const [selected, setSelected] = useState<{ kind: 'unit' | 'edge' | 'pile'; id: string; from?: string; port?: string; target?: string } | null>(null);
  const [tempEnd, setTempEnd] = useState<Pos | null>(null);
  // Right-click "add equipment" menu (screen position + world drop point).
  const [menu, setMenu] = useState<{ sx: number; sy: number; w: Pos } | null>(null);
  // While a box is being dragged we only move it locally (no plant edit, so no
  // re-simulation) and commit once on release — keeps dragging smooth on big plants.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [help, setHelp] = useState(false);
  const posD = useMemo(() => {
    if (!dragPos) return pos;
    const m = new Map(pos);
    m.set(dragPos.id, { x: dragPos.x, y: dragPos.y });
    return m;
  }, [pos, dragPos]);
  const drag = useRef<
    | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { mode: 'node'; id: string; ox: number; oy: number; moved: boolean }
    | { mode: 'connect'; id: string; port: string }
    | null
  >(null);
  const longPress = useRef<number | undefined>(undefined);
  const clearLongPress = () => { if (longPress.current) { clearTimeout(longPress.current); longPress.current = undefined; } };

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
  // Export the whole flowsheet as a PNG (styles inlined so class-based node/label
  // styling survives serialization).
  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const b = bounds;
    clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
    clone.setAttribute('width', String(Math.round(b.w)));
    clone.setAttribute('height', String(Math.round(b.h)));
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent =
      '.fs-node-box{fill:#fff;stroke:#c7d0db;stroke-width:1.5px}.fs-node-box.bad{stroke:#e23a13}.fs-node-name{font:700 12px system-ui,sans-serif;fill:#0f2350}.fs-node-sub{font:10px system-ui,sans-serif;fill:#5a6a86}.fs-port{fill:#fff;stroke:#1963ff;stroke-width:2px}.fs-edge-label{font:9px system-ui,sans-serif;fill:#5a6a86;paint-order:stroke;stroke:#fff;stroke-width:3px}.fs-x{font:11px system-ui,sans-serif;fill:#d9480f}';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(b.x)); bg.setAttribute('y', String(b.y));
    bg.setAttribute('width', String(b.w)); bg.setAttribute('height', String(b.h)); bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(b.w * scale);
      canvas.height = Math.round(b.h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, b.w, b.h);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'flowsheet.png'; a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };
  const zoom = (factor: number, cx?: number, cy?: number) => {
    const c = cx != null && cy != null ? toWorld(cx, cy) : { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    setView((v) => ({ x: c.x - (c.x - v.x) * factor, y: c.y - (c.y - v.y) * factor, w: v.w * factor, h: v.h * factor }));
  };

  // hit-test a world point against unit boxes and stockpile nodes (so you can
  // wire an output straight into a pile).
  const unitAt = (p: Pos): string | null => {
    for (const u of plant.units) {
      const q = pos.get(u.id);
      if (q && p.x >= q.x && p.x <= q.x + W && p.y >= q.y && p.y <= q.y + H) return u.id;
    }
    return null;
  };
  // Hit-test an *auto* product pile node (returns its key), so dropping an output
  // onto it can fold that pile into a shared stockpile.
  const autoPileAt = (p: Pos): string | null => {
    for (const pile of result.piles) {
      if (pile.key.startsWith('pileunit:')) continue;
      const q = pos.get(`pile:${pile.key}`);
      if (q && p.x >= q.x && p.x <= q.x + W && p.y >= q.y && p.y <= q.y + H) return pile.key;
    }
    return null;
  };
  // Drop an output onto an auto pile → create a stockpile at that spot and route
  // that pile's existing feeders *and* the new output into it, so they combine.
  const adoptAutoPile = (autoKey: string, srcUnit: string, srcPort: string) => {
    const made = addPile(plant); // auto-position it (so it doesn't overlap the pile it replaced)
    let next = made.plant;
    plant.units.forEach((u) => {
      portsOf(u).forEach((port) => {
        if (`pile:${portKey(u, port)}` !== `pile:${autoKey}`) return;
        routesOfPort(u, port).forEach((r) => {
          const toUnit = r.to !== PILE && plant.units.some((x) => x.id === r.to);
          if (r.frac > 0 && r.to !== MERGE && !toUnit) next = connect(next, u.id, port, made.id);
        });
      });
    });
    next = connect(next, srcUnit, srcPort, made.id);
    onChange(next);
    setSelected({ kind: 'pile', id: made.id });
    setFitNonce((n) => n + 1);
  };

  const onPointerDownBg = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (menu) { setMenu(null); return; }
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    setSelected(null);
    svgRef.current?.setPointerCapture(e.pointerId);
    // Touch has no right-click: long-press the empty canvas to open the add menu.
    if (e.pointerType === 'touch') {
      const cx = e.clientX, cy = e.clientY;
      clearLongPress();
      longPress.current = window.setTimeout(() => {
        const w = toWorld(cx, cy);
        setMenu({ sx: cx, sy: cy, w: { x: Math.round(w.x - W / 2), y: Math.round(w.y - H / 2) } });
        drag.current = null;
      }, 500);
    }
  };
  // Right-click anywhere on the canvas → menu to drop a new unit at that spot.
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    setMenu({ sx: e.clientX, sy: e.clientY, w: { x: Math.round(w.x - W / 2), y: Math.round(w.y - H / 2) } });
  };
  const addFromMenu = (kind: 'screen' | 'crusher' | 'feed' | 'pile') => {
    if (!menu) return;
    const res = kind === 'feed' ? addFeed(plant, menu.w) : kind === 'pile' ? addPile(plant, menu.w) : addUnit(plant, kind, menu.w);
    onChange(res.plant);
    setSelected(kind === 'pile' ? { kind: 'pile', id: res.id } : { kind: 'unit', id: res.id });
    setMenu(null);
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
      if (longPress.current && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) clearLongPress();
      const s = scale();
      setView((v) => ({ ...v, x: d.vx - (e.clientX - d.sx) * s, y: d.vy - (e.clientY - d.sy) * s }));
    } else if (d.mode === 'node') {
      const w = toWorld(e.clientX, e.clientY);
      d.moved = true;
      setDragPos({ id: d.id, x: Math.round(w.x - d.ox), y: Math.round(w.y - d.oy) });
    } else if (d.mode === 'connect') {
      setTempEnd(toWorld(e.clientX, e.clientY));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    clearLongPress();
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'node' && d.moved) {
      const w = toWorld(e.clientX, e.clientY);
      onChange(setLayout(plant, d.id, { x: Math.round(w.x - d.ox), y: Math.round(w.y - d.oy) }));
      setDragPos(null);
    } else if (d.mode === 'node' && !d.moved) {
      // Click a unit to edit it, or a pile (explicit stockpile or auto) to select it.
      const isPileNode = d.id.startsWith('pile:') || plant.units.some((u) => u.id === d.id && u.kind === 'pile');
      setSelected(isPileNode ? { kind: 'pile', id: d.id } : { kind: 'unit', id: d.id });
    } else if (d.mode === 'connect') {
      const w = toWorld(e.clientX, e.clientY);
      setTempEnd(null);
      const hit = unitAt(w);
      if (hit && hit !== d.id) { onChange(connect(plant, d.id, d.port, hit)); return; } // onto a box or stockpile
      const autoKey = autoPileAt(w);
      if (autoKey) adoptAutoPile(autoKey, d.id, d.port); // onto an auto pile → combine into a stockpile
      else onChange(connect(plant, d.id, d.port, PILE)); // empty space → its own product pile
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
  const addPileAt = () => {
    const { plant: next, id } = addPile(plant, centerPos());
    onChange(next);
    setSelected({ kind: 'pile', id });
  };

  // --- edges ------------------------------------------------------------------
  type Edge = { id: string; from: string; port: string; toKey: string; a: Pos; b: Pos; srcBottom?: boolean; tph: number; recycle: boolean };
  const portTotal = (u: PlantUnit, port: string): number => {
    const n = nodeById.get(u.id);
    if (u.kind === 'feed') return u.tph;
    if (u.kind === 'crusher') return n && n.kind === 'crusher' ? n.output.tph : 0;
    if (n && n.kind === 'screen') return port === 'under' ? n.result.undersize.tph : n.result.products[Number(port.split(':')[1])]?.stream.tph ?? 0;
    return 0;
  };
  // Ports that leave the *right* edge (everything except a screen's undersize).
  const rightPortsOf = (u: PlantUnit): string[] => portsOf(u).filter((p) => !(u.kind === 'screen' && p === 'under'));
  // Anchor for an output port: right-edge fan, except a screen's undersize (what
  // passes *through* the deck) sits at the bottom of the box.
  const portAnchor = (u: PlantUnit, port: string): Pos & { bottom: boolean } => {
    const q = posD.get(u.id)!;
    if (u.kind === 'screen' && port === 'under') return { x: q.x + W / 2, y: q.y + H, bottom: true };
    const rp = rightPortsOf(u);
    const k = Math.max(0, rp.indexOf(port));
    const total = rp.length;
    return { x: q.x + W, y: q.y + 18 + (total > 1 ? (k * (H - 30)) / (total - 1) : (H - 30) / 2), bottom: false };
  };
  // First collect links with just their source anchor; the target anchor is set
  // afterwards so several links into one box fan across its left face.
  type Raw = { id: string; from: string; port: string; toKey: string; node: string; a: Pos; srcBottom: boolean; tph: number; recycle: boolean };
  const raw: Raw[] = [];
  plant.units.forEach((u) => {
    const ports = portsOf(u);
    ports.forEach((port) => {
      const routes = routesOfPort(u, port);
      const sum = routes.reduce((a, r) => a + (r.frac > 0 ? r.frac : 0), 0) || 1;
      const a = portAnchor(u, port);
      routes.forEach((r) => {
        if (r.frac <= 0) return;
        const tph = portTotal(u, port) * (r.frac / sum);
        const toUnit = r.to !== PILE && plant.units.some((x) => x.id === r.to);
        const node = toUnit ? r.to : `pile:${portKey(u, port)}`;
        if (!posD.has(node)) return;
        // A link back to a unit at or left of the source is a recycle loop.
        const recycle = toUnit && posD.get(r.to)!.x <= posD.get(u.id)!.x;
        raw.push({ id: `${u.id}|${port}|${r.to}`, from: u.id, port, toKey: r.to, node, a, srcBottom: a.bottom, tph, recycle });
      });
    });
  });
  // Fan the links entering each box across its left face, ordered by where they
  // leave their source — so parallel inputs slot in without tangling.
  const edges: Edge[] = [];
  const byTarget = new Map<string, Raw[]>();
  raw.forEach((e) => (byTarget.get(e.node) ?? byTarget.set(e.node, []).get(e.node)!).push(e));
  byTarget.forEach((list, node) => {
    const q = posD.get(node)!;
    list.sort((p, r) => p.a.y - r.a.y);
    list.forEach((e, i) => {
      const by = q.y + 18 + (list.length > 1 ? (i * (H - 36)) / (list.length - 1) : (H - 36) / 2);
      edges.push({ id: e.id, from: e.from, port: e.port, toKey: e.toKey, a: e.a, b: { x: q.x, y: by }, srcBottom: e.srcBottom, tph: e.tph, recycle: e.recycle });
    });
  });

  const selUnit = selected?.kind === 'unit' ? plant.units.find((u): u is Exclude<PlantUnit, { kind: 'pile' }> => u.id === selected.id && u.kind !== 'pile') : undefined;
  if (selected?.kind === 'unit' && !selUnit) setSelected(null); // unit was deleted

  // Selected pile → its result data + which outputs feed it, for the info panel.
  const selPileExplicit = selected?.kind === 'pile' && plant.units.some((u) => u.id === selected.id && u.kind === 'pile');
  const selPileKey = selected?.kind === 'pile' ? (selPileExplicit ? `pileunit:${selected.id}` : selected.id.replace(/^pile:/, '')) : null;
  const selPile = selPileKey ? result.piles.find((p) => p.key === selPileKey) ?? null : null;
  const pileFeeders = selPile
    ? plant.units.flatMap((u) =>
        portsOf(u).flatMap((port) => {
          const routes = routesOfPort(u, port);
          const sum = routes.reduce((a, r) => a + (r.frac > 0 ? r.frac : 0), 0) || 1;
          return routes.flatMap((r) => {
            if (r.frac <= 0 || r.to === MERGE) return [];
            const targetPile = plant.units.find((x) => x.id === r.to && x.kind === 'pile');
            const feeds = targetPile ? `pileunit:${targetPile.id}` === selPile.key : (r.to === PILE || !plant.units.some((x) => x.id === r.to)) && portKey(u, port) === selPile.key;
            return feeds ? [{ name: u.name, label: portLabel(u, port), tph: portTotal(u, port) * (r.frac / sum) }] : [];
          });
        }),
      )
    : [];

  // Delete a product pile: disconnect every output route that feeds it (each such
  // port then caps or folds), so the pile disappears.
  const deletePile = (pileKey: string) => {
    let next = plant;
    const feeders: { id: string; port: string; target: string }[] = [];
    plant.units.forEach((u) => {
      portsOf(u).forEach((port) => {
        if (`pile:${portKey(u, port)}` !== pileKey) return;
        routesOfPort(u, port).forEach((r) => {
          const toUnit = r.to !== PILE && plant.units.some((x) => x.id === r.to);
          if (r.frac > 0 && r.to !== MERGE && !toUnit) feeders.push({ id: u.id, port, target: r.to });
        });
      });
    });
    feeders.forEach((f) => { next = disconnect(next, f.id, f.port, f.target); });
    onChange(next);
    setSelected(null);
  };
  // An explicit stockpile is a real unit (remove it); an auto product pile is
  // derived, so remove it by disconnecting its feeders.
  const removePileNode = (pileNodeKey: string) => {
    if (plant.units.some((u) => u.id === pileNodeKey && u.kind === 'pile')) { onChange(removeUnit(plant, pileNodeKey)); setSelected(null); }
    else deletePile(pileNodeKey);
  };

  // Delete / Backspace removes the selected link or pile (unless you're typing).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      const t = ev.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (selected?.kind === 'edge' && selected.from && selected.port && selected.target != null) {
        ev.preventDefault();
        onChange(disconnect(plant, selected.from, selected.port, selected.target));
        setSelected(null);
      } else if (selected?.kind === 'pile') {
        ev.preventDefault();
        removePileNode(selected.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, plant, onChange]);

  // A recycle link returns through a lane *below* every box it spans, so it never
  // cuts across the forward flows between the source and its target.
  const recycleDip = (e: Edge): number => {
    const loX = Math.min(e.a.x, e.b.x), hiX = Math.max(e.a.x, e.b.x);
    let clear = Math.max(e.a.y, e.b.y);
    posD.forEach((p) => { if (p.x + W > loX && p.x < hiX) clear = Math.max(clear, p.y + H); });
    return clear + 46;
  };
  // A plain output→target S-curve (horizontal tangents at both ends).
  const straight = (e: Edge) => {
    const k = Math.max(28, Math.min(110, Math.abs(e.b.x - e.a.x) * 0.5));
    // An undersize link leaves the bottom of the screen going down, then curves out.
    if (e.srcBottom) return `M ${e.a.x} ${e.a.y} C ${e.a.x} ${e.a.y + 46}, ${e.b.x - k} ${e.b.y}, ${e.b.x} ${e.b.y}`;
    return `M ${e.a.x} ${e.a.y} C ${e.a.x + k} ${e.a.y}, ${e.b.x - k} ${e.b.y}, ${e.b.x} ${e.b.y}`;
  };
  // Forward edges use the S-curve. A recycle edge drops into the return lane and
  // rises back into the target.
  const edgePath = (e: Edge) => {
    if (e.recycle) {
      const dip = recycleDip(e);
      return `M ${e.a.x} ${e.a.y} C ${e.a.x + 50} ${dip}, ${e.b.x - 50} ${dip}, ${e.b.x} ${e.b.y}`;
    }
    return straight(e);
  };

  // Mutual pairs: A feeds B and B feeds straight back to A. Draw ONE two-way
  // arrow along the forward curve instead of a separate dotted return line.
  const isUnit = (id: string) => plant.units.some((u) => u.id === id);
  const dirEdge = new Map<string, Edge>();
  edges.forEach((e) => { if (isUnit(e.toKey)) dirEdge.set(`${e.from}->${e.toKey}`, e); });
  const foldedBack = new Set<string>(); // recycle edges shown as the back-head of a two-way arrow
  const twoWay = new Map<string, Edge>(); // forward edge id → its back edge
  edges.forEach((e) => {
    if (!isUnit(e.toKey)) return;
    const rev = dirEdge.get(`${e.toKey}->${e.from}`);
    if (!rev || rev.id === e.id || foldedBack.has(e.id)) return;
    const primaryIsE = e.recycle === rev.recycle ? e.id < rev.id : !e.recycle; // the forward one leads
    if (primaryIsE) { twoWay.set(e.id, rev); foldedBack.add(rev.id); }
  });

  return (
    <div className="fs-wrap">
      <div className="fs-toolbar">
        <button className="secondary" onClick={() => addAt('screen')}>+ Screen</button>
        <button className="secondary" onClick={() => addAt('crusher')}>+ Crusher</button>
        <button className="secondary" onClick={addFeedAt}>+ Feed</button>
        <button className="secondary" onClick={addPileAt}>+ Pile</button>
        <span className="fs-tb-gap" />
        <button className="secondary fs-zoom" onClick={() => zoom(1 / 1.2)} title="Zoom in" aria-label="zoom in">+</button>
        <button className="secondary fs-zoom" onClick={() => zoom(1.2)} title="Zoom out" aria-label="zoom out">−</button>
        <button className="secondary" onClick={fit} title="Fit to view">Fit</button>
        <button className="secondary" onClick={() => { onChange(clearLayout(plant)); setFitNonce((n) => n + 1); }} title="Auto-arrange">Auto-arrange</button>
        <button className="secondary" onClick={exportPng} title="Download the flowsheet as a PNG">⭳ PNG</button>
        <button className="secondary" onClick={() => setHelp((h) => !h)} title="How to use the flowsheet" aria-expanded={help}>? Help</button>
        <span className="fs-hint">Right-click to add · drag a ● output to wire</span>
      </div>

      {help && (
        <div className="fs-help">
          <ul>
            <li><strong>Add equipment</strong> — the + buttons, or right-click the canvas to drop one where you click.</li>
            <li><strong>Wire</strong> — drag a ● output onto a box, onto a pile (to combine outputs into one stockpile), or onto empty space (makes a product pile).</li>
            <li><strong>Edit / inspect</strong> — click a box for its settings; click a pile for its tonnage &amp; gradation.</li>
            <li><strong>Move</strong> — drag any box or pile. <em>Fit</em> reframes, <em>Auto-arrange</em> re-lays-out.</li>
            <li><strong>Delete</strong> — click a link or pile, then ✕ (or press Delete).</li>
            <li>A screen's <strong>undersize</strong> port is at the bottom; oversize ports on the right.</li>
          </ul>
        </div>
      )}

      <div className="fs-legend">
        <span className="fs-leg-item">
          <svg width="30" height="12" aria-hidden="true"><line x1="1" y1="6" x2="22" y2="6" stroke="#9aa4b0" strokeWidth="1.6" /><path d="M22,3 L29,6 L22,9 z" fill="#9aa4b0" /></svg>
          flow
        </span>
        <span className="fs-leg-item">
          <svg width="30" height="12" aria-hidden="true"><path d="M8,3 L1,6 L8,9 z" fill="#dc2626" /><line x1="7" y1="6" x2="23" y2="6" stroke="#dc2626" strokeWidth="2" /><path d="M22,3 L29,6 L22,9 z" fill="#dc2626" /></svg>
          returns to the same machine
        </span>
        <span className="fs-leg-item">
          <svg width="30" height="12" aria-hidden="true"><line x1="1" y1="6" x2="22" y2="6" stroke="#b58bd8" strokeWidth="1.6" strokeDasharray="4 3" /><path d="M22,3 L29,6 L22,9 z" fill="#b58bd8" /></svg>
          recycle loop
        </span>
        <span className="fs-leg-item">
          <svg width="30" height="12" aria-hidden="true"><path d="M2,10 C 14,10 14,2 26,2" fill="none" stroke="#b58bd8" strokeWidth="1.6" strokeDasharray="4 3" /></svg>
          merged into another output
        </span>
      </div>

      <p className="fs-touch-note">On touch: <strong>long-press</strong> the canvas to add equipment · drag to pan · use +/− to zoom · rotate to landscape for more room.</p>

      <div className="fs-body">
        <svg
          ref={svgRef}
          className="fs-canvas"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerDown={onPointerDownBg}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onContextMenu={onContextMenu}
        >
          <defs>
            <marker id="fs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#9aa4b0" />
            </marker>
            {/* Red head for two-way (recirculation) arrows — colour, not size,
                sets them apart (see the legend). */}
            <marker id="fs-arrow-2w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#dc2626" />
            </marker>
          </defs>

          {edges.map((e) => {
            if (foldedBack.has(e.id)) return null; // drawn as the back-head of its two-way partner
            const back = twoWay.get(e.id);
            const on = selected?.kind === 'edge' && selected.id === e.id;
            const d = back ? straight(e) : edgePath(e);
            const midx = (e.a.x + e.b.x) / 2, midy = (e.a.y + e.b.y) / 2;
            // A two-way arrow's ✕/Delete removes the loop-back route (leaving the
            // forward link as a normal one-way arrow you can then delete too).
            const [delFrom, delPort, delTarget] = back ? [back.from, back.port, back.toKey] : [e.from, e.port, e.toKey];
            return (
              <g key={e.id}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }}
                  onPointerDown={(ev) => { ev.stopPropagation(); setSelected({ kind: 'edge', id: e.id, from: delFrom, port: delPort, target: delTarget }); }} />
                <path d={d} fill="none"
                  stroke={back ? (on ? '#b91c1c' : '#dc2626') : on ? '#d9480f' : e.recycle ? '#b58bd8' : '#9aa4b0'}
                  strokeWidth={back ? (on ? 2.6 : 2) : on ? 2.4 : 1.6}
                  strokeDasharray={e.recycle && !back ? '5 4' : undefined}
                  markerEnd={back ? 'url(#fs-arrow-2w)' : 'url(#fs-arrow)'} markerStart={back ? 'url(#fs-arrow-2w)' : undefined} />
                {e.tph > 0.5 && <text x={midx} y={back ? midy - 9 : e.recycle ? recycleDip(e) - 8 : midy - 3} className="fs-edge-label" textAnchor="middle" fill={back ? '#dc2626' : undefined}>{round(e.tph)} tph</text>}
                {back && back.tph > 0.5 && <text x={midx} y={midy + 18} className="fs-edge-label" textAnchor="middle" fill="#dc2626">{round(back.tph)} tph</text>}
                {on && (
                  <g transform={`translate(${midx} ${midy})`} style={{ cursor: 'pointer' }}
                    onPointerDown={(ev) => { ev.stopPropagation(); onChange(disconnect(plant, delFrom, delPort, delTarget)); setSelected(null); }}>
                    <circle r={9} fill="#fff" stroke="#d9480f" strokeWidth={1.5} />
                    <text className="fs-x" textAnchor="middle" y={3.5}>✕</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* MERGE folds: a capped-but-folded output loops into its sink sibling
              on the same box (dashed) — its tonnage lands in that pile. */}
          {plant.units.map((u) => {
            if (u.kind !== 'screen') return null;
            const sink = mergeSinkPort(u);
            if (!sink) return null;
            const ports = portsOf(u);
            return ports.map((port) => {
              if (!isMergeSplit(routesOfPort(u, port))) return null;
              const a = portAnchor(u, port);
              const b = portAnchor(u, sink);
              const mx = Math.max(a.x, b.x) + 30;
              const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
              const fid = `${u.id}|${port}|merge`;
              const on = selected?.kind === 'edge' && selected.id === fid;
              return (
                <g key={`fold-${u.id}-${port}`}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }}
                    onPointerDown={(ev) => { ev.stopPropagation(); setSelected({ kind: 'edge', id: fid, from: u.id, port, target: MERGE }); }} />
                  <path d={d} fill="none" stroke={on ? '#d9480f' : '#b58bd8'} strokeWidth={on ? 2.2 : 1.4} strokeDasharray="4 3" />
                  <text x={mx + 4} y={(a.y + b.y) / 2 + 3} className="fs-edge-label">merged</text>
                  {on && (
                    <g transform={`translate(${mx} ${(a.y + b.y) / 2})`} style={{ cursor: 'pointer' }}
                      onPointerDown={(ev) => { ev.stopPropagation(); onChange(disconnect(plant, u.id, port, MERGE)); setSelected(null); }}>
                      <circle r={9} fill="#fff" stroke="#d9480f" strokeWidth={1.5} />
                      <text className="fs-x" textAnchor="middle" y={3.5}>✕</text>
                    </g>
                  )}
                </g>
              );
            });
          })}

          {tempEnd && drag.current?.mode === 'connect' && (() => {
            const dc = drag.current;
            const u = plant.units.find((x) => x.id === dc.id);
            if (!u) return null;
            const a = portAnchor(u, dc.port);
            return <line className="fs-temp-edge" x1={a.x} y1={a.y} x2={tempEnd.x} y2={tempEnd.y} markerEnd="url(#fs-arrow)" />;
          })()}

          {/* pile nodes — auto product piles + explicit stockpiles; draggable,
              click to select, ✕ to delete */}
          {[
            ...result.piles.filter((p) => !p.key.startsWith('pileunit:')).map((p) => ({ nodeKey: `pile:${p.key}`, name: p.product, tph: p.stream.tph })),
            ...plant.units.filter((u) => u.kind === 'pile').map((u) => ({ nodeKey: u.id, name: u.name, tph: result.piles.find((p) => p.key === `pileunit:${u.id}`)?.stream.tph ?? 0 })),
          ].map((pn) => {
            const q = posD.get(pn.nodeKey);
            if (!q) return null;
            const sel = selected?.kind === 'pile' && selected.id === pn.nodeKey;
            return (
              <g key={pn.nodeKey} transform={`translate(${q.x} ${q.y})`} style={{ cursor: 'grab' }} onPointerDown={(e) => onNodeDown(e, pn.nodeKey)}>
                <rect x={0} y={4} width={W} height={H - 4} rx={12} fill="transparent" stroke={sel ? '#d9480f' : 'none'} strokeWidth={sel ? 2 : 0} strokeDasharray="4 3" />
                <g transform={`translate(${W / 2} 34)`} style={{ pointerEvents: 'none' }}>{symbol('stockpile', 3)}</g>
                <text x={W / 2} y={66} className="fs-node-name" textAnchor="middle" style={{ pointerEvents: 'none' }}>{pn.name}</text>
                <text x={W / 2} y={80} className="fs-node-sub" textAnchor="middle" style={{ pointerEvents: 'none' }}>{round(pn.tph)} tph</text>
                {sel && (
                  <g transform={`translate(${W - 6} 8)`} style={{ cursor: 'pointer' }} onPointerDown={(ev) => { ev.stopPropagation(); removePileNode(pn.nodeKey); }}>
                    <circle r={9} fill="#fff" stroke="#d9480f" strokeWidth={1.5} />
                    <text className="fs-x" textAnchor="middle" y={3.5}>✕</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* unit nodes (piles are rendered above) */}
          {plant.units.map((u) => {
            if (u.kind === 'pile') return null;
            const q = posD.get(u.id)!;
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
                {/* output ports: right edge, but a screen's undersize sits at the bottom */}
                {ports.map((port) => {
                  const bottom = u.kind === 'screen' && port === 'under';
                  const rp = rightPortsOf(u);
                  const cx = bottom ? W / 2 : W;
                  const cy = bottom ? H : 18 + (rp.length > 1 ? (rp.indexOf(port) * (H - 30)) / (rp.length - 1) : (H - 30) / 2);
                  return (
                    <g key={port} style={{ cursor: 'crosshair' }} onPointerDown={(e) => onPortDown(e, u.id, port)}>
                      <circle cx={cx} cy={cy} r={14} fill="transparent" />
                      <circle className="fs-port" cx={cx} cy={cy} r={5} />
                      <title>{portLabel(u, port)} {bottom ? '↓' : '→'}</title>
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

        {selPile && (() => {
          const g = selPile.stream.gradation;
          const top = g.length ? Math.max(...g.map((x) => x.size)) : 0;
          const p80 = g.length ? sizeAtPassing(g, 80) : 0;
          const fmt = (n: number) => (!Number.isFinite(n) || n <= 0 ? '—' : n < 1 ? n.toFixed(2) : n.toFixed(1));
          return (
            <aside className="fs-inspector">
              <div className="fs-insp-head">
                <strong>{selPileExplicit ? 'Stockpile' : 'Product pile'}</strong>
                <button className="link-btn" onClick={() => setSelected(null)}>close ✕</button>
              </div>
              <div className="pile-info">
                <div className="pile-info-name">{selPile.product}</div>
                <dl className="pile-info-dl">
                  <div><dt>Tonnage</dt><dd>{round(selPile.stream.tph)} tph</dd></div>
                  <div><dt>% of feed</dt><dd>{result.feedTph ? ((selPile.stream.tph / result.feedTph) * 100).toFixed(1) : '0'}%</dd></div>
                  <div><dt>Top size</dt><dd>{fmt(top)} mm</dd></div>
                  <div><dt>P80</dt><dd>{fmt(p80)} mm</dd></div>
                  {selPile.stream.density != null && <div><dt>Bulk density</dt><dd>{round(selPile.stream.density)} lb/ft³</dd></div>}
                </dl>
                <div className="pile-feeders">
                  <div className="pile-feeders-h">Fed by</div>
                  {pileFeeders.length ? (
                    <ul>{pileFeeders.map((f, i) => (<li key={i}><span>{f.name} · {f.label}</span><span className="num">{round(f.tph)} tph</span></li>))}</ul>
                  ) : (
                    <p className="muted">Nothing routed here yet — drag a box output onto this pile.</p>
                  )}
                </div>
                {g.length > 1 && (
                  <div className="pile-grad">
                    <div className="pile-feeders-h">Gradation</div>
                    <table className="pile-grad-table">
                      <thead><tr><th>Size</th><th className="num">% passing</th></tr></thead>
                      <tbody>
                        {[...g].sort((a, b) => b.size - a.size).map((pt, i) => (
                          <tr key={i}><td>{fmt(pt.size)} mm</td><td className="num">{pt.percentPassing.toFixed(1)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button className="secondary danger" onClick={() => removePileNode(selected!.id)}>{selPileExplicit ? 'Remove stockpile' : 'Remove pile'}</button>
              </div>
            </aside>
          );
        })()}
      </div>

      {menu && (
        <>
          <div className="fs-menu-backdrop" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fs-menu" style={{ left: Math.min(menu.sx, window.innerWidth - 180), top: Math.min(menu.sy, window.innerHeight - 170) }}>
            <div className="fs-menu-h">Add equipment</div>
            <button onClick={() => addFromMenu('feed')}>Feed</button>
            <button onClick={() => addFromMenu('screen')}>Screen</button>
            <button onClick={() => addFromMenu('crusher')}>Crusher</button>
            <button onClick={() => addFromMenu('pile')}>Stockpile</button>
          </div>
        </>
      )}
    </div>
  );
}
