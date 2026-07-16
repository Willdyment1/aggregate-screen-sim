// Routed-plant solver. Units are wired output→input arbitrarily, so the graph
// may contain recycle loops (deck → crusher → back to a screen). We solve by
// successive substitution: start every unit input at zero, and each pass
// recompute all unit outputs from the previous pass's inputs and re-route them.
// Recirculating loads build up until the inputs stop changing (steady state).
// Diverging loops (a crusher too coarse to break the recycle) are capped and
// flagged as runaway — matching the single-unit engine.
import type { Plant, PlantScreen, PlantCrusher, Target, Split } from '../model/plant';
import { PILE } from '../model/plant';
import type { Stream } from '../model/types';
import { sieveLabel } from '../model/sieves';
import { blendGradations } from './gradation';
import { crusherProduct, crusherReduction } from './crusher';
import { processScreen, type ScreenUnitResult } from './screenUnit';

export interface ScreenNode {
  kind: 'screen';
  id: string;
  name: string;
  input: Stream;
  result: ScreenUnitResult;
}
export interface CrusherNode {
  kind: 'crusher';
  id: string;
  name: string;
  input: Stream;
  output: Stream;
  reductionRatio: number;
  overCapacity: boolean;
  capacity: number;
}
export type PlantNode = ScreenNode | CrusherNode;

export interface Pile {
  fromUnit: string;
  label: string;
  stream: Stream;
  /** Canonical product identity (size band) — piles that share it are merged. */
  key: string;
  /** Clean size descriptor, e.g. "+3/4\"", "−3/8\"", "Crushed 13 mm". */
  product: string;
}

export interface PlantResult {
  nodes: PlantNode[];
  piles: Pile[];
  feedTph: number;
  runaway: boolean;
  iterations: number;
}

const EMPTY: Stream = { tph: 0, gradation: [] };
const MAX_ITER = 1000;
const TOL = 0.02; // tph
const RUNAWAY = 100; // × total feed

const blend = (streams: Stream[]): Stream => {
  const arr = streams.filter((s) => s.tph > 0);
  if (!arr.length) return EMPTY;
  const tph = arr.reduce((s, x) => s + x.tph, 0);
  // Mass-weighted density over the streams that carry one.
  const withD = arr.filter((x) => x.density != null);
  const dTph = withD.reduce((s, x) => s + x.tph, 0);
  const density = withD.length && dTph > 0 ? withD.reduce((s, x) => s + x.density! * x.tph, 0) / dTph : undefined;
  return { tph, gradation: blendGradations(arr), density };
};

const DEFAULT_ROUTE: Split = [{ to: PILE, frac: 1 }];

/** Divide a stream across a split's routes (by mass; gradation unchanged) and
 *  hand each piece to `sink`. Fractions are normalised so mass is conserved
 *  even if the user's percentages don't add exactly to 100%. */
const send = (routes: Split, stream: Stream, sink: (to: Target, s: Stream) => void) => {
  const rs = routes && routes.length ? routes : DEFAULT_ROUTE;
  const sum = rs.reduce((a, r) => a + (r.frac > 0 ? r.frac : 0), 0);
  if (sum <= 0) {
    sink(rs[0]?.to ?? PILE, stream);
    return;
  }
  for (const r of rs) {
    if (r.frac > 0) sink(r.to, { tph: stream.tph * (r.frac / sum), gradation: stream.gradation, density: stream.density });
  }
};

export function simulatePlant(plant: Plant): PlantResult {
  const byId = new Map(plant.units.map((u) => [u.id, u]));
  const feeds = plant.units.filter((u): u is Extract<Plant['units'][number], { kind: 'feed' }> => u.kind === 'feed');
  const screens = plant.units.filter((u): u is PlantScreen => u.kind === 'screen');
  const crushers = plant.units.filter((u): u is PlantCrusher => u.kind === 'crusher');
  const totalFeed = feeds.reduce((s, f) => s + f.tph, 0) || 1;
  const density = feeds[0]?.bulkDensity ?? 100;
  const wet = feeds[0]?.wet ?? false;
  const opts = { bulkDensity: density, wet, realistic: plant.realistic };

  // Input stream feeding each screen/crusher; converged by iteration.
  let inputs = new Map<string, Stream>();
  [...screens, ...crushers].forEach((u) => inputs.set(u.id, EMPTY));

  let runaway = false;
  let converged = false;
  let iterations = 0;

  /** One evaluation pass: route feed + each unit's outputs (from `inputs`)
   *  into fresh incoming lists; returns the next input map. */
  const pass = (src: Map<string, Stream>) => {
    const incoming = new Map<string, Stream[]>();
    [...screens, ...crushers].forEach((u) => incoming.set(u.id, []));
    const route = (target: Target, stream: Stream) => {
      if (target !== PILE && byId.has(target) && incoming.has(target) && stream.tph > 0) {
        incoming.get(target)!.push(stream);
      }
    };
    feeds.forEach((f) => send(f.out, { tph: f.tph, gradation: f.gradation, density: f.bulkDensity }, route));
    screens.forEach((u) => {
      const inp = src.get(u.id) ?? EMPTY;
      const res = processScreen(inp, u.decks, { width: u.width, length: u.length, travelRate: u.travelRate }, { ...opts, bulkDensity: inp.density ?? opts.bulkDensity, targetEfficiency: u.targetEfficiency });
      res.products.forEach((p) => send(u.deckTargets[p.deckIndex] ?? DEFAULT_ROUTE, { ...p.stream, density: inp.density }, route));
      send(u.underTarget, { ...res.undersize, density: inp.density }, route);
    });
    crushers.forEach((u) => {
      const inp = src.get(u.id) ?? EMPTY;
      send(u.out, { tph: inp.tph, gradation: crusherProduct(u.css, inp.gradation, u.crusherType), density: inp.density }, route);
    });
    const next = new Map<string, Stream>();
    incoming.forEach((list, id) => next.set(id, blend(list)));
    return next;
  };

  for (let it = 0; it < MAX_ITER; it++) {
    iterations = it + 1;
    const next = pass(inputs);
    // Runaway: a recycle that isn't reducing blows the recirculating load up.
    for (const s of next.values()) {
      if (s.tph > totalFeed * RUNAWAY) {
        runaway = true;
        break;
      }
    }
    if (runaway) break;
    // Converged when no unit input changed materially.
    let maxDelta = 0;
    next.forEach((s, id) => (maxDelta = Math.max(maxDelta, Math.abs(s.tph - (inputs.get(id)?.tph ?? 0)))));
    inputs = next;
    if (maxDelta < TOL) {
      converged = true;
      break;
    }
  }
  // Never settling means a recycle loop that keeps growing (loop gain ≥ 1).
  if (!converged) runaway = true;

  // Final pass: compute per-unit results from the converged inputs and collect
  // every output routed to a pile.
  const nodes: PlantNode[] = [];
  const rawPiles: Pile[] = [];
  const toPile = (label: string, product: string, key: string, fromUnit: string) => (target: Target, stream: Stream) => {
    if ((target === PILE || !byId.has(target)) && stream.tph > 0.001) rawPiles.push({ fromUnit, label, product, key, stream });
  };

  for (const u of plant.units) {
    if (u.kind === 'feed') {
      send(u.out, { tph: u.tph, gradation: u.gradation, density: u.bulkDensity }, toPile(`${u.name} (unrouted)`, 'Feed (unrouted)', `feed:${u.id}`, u.id));
    } else if (u.kind === 'screen') {
      const input = inputs.get(u.id) ?? EMPTY;
      const result = processScreen(input, u.decks, { width: u.width, length: u.length, travelRate: u.travelRate }, { ...opts, bulkDensity: input.density ?? opts.bulkDensity, targetEfficiency: u.targetEfficiency });
      nodes.push({ kind: 'screen', id: u.id, name: u.name, input, result });
      result.products.forEach((p) => send(u.deckTargets[p.deckIndex] ?? DEFAULT_ROUTE, { ...p.stream, density: input.density }, toPile(`${u.name} · +${sieveLabel(p.aperture)}`, `+${sieveLabel(p.aperture)}`, `over:${p.aperture}`, u.id)));
      const bottom = u.decks[u.decks.length - 1].aperture;
      send(u.underTarget, { ...result.undersize, density: input.density }, toPile(`${u.name} · −${sieveLabel(bottom)}`, `−${sieveLabel(bottom)}`, `under:${bottom}`, u.id));
    } else {
      const input = inputs.get(u.id) ?? EMPTY;
      const output: Stream = { tph: input.tph, gradation: crusherProduct(u.css, input.gradation, u.crusherType), density: input.density };
      const feedTop = Math.max(0, ...input.gradation.map((p) => p.size));
      nodes.push({ kind: 'crusher', id: u.id, name: u.name, input, output, reductionRatio: crusherReduction(u.crusherType ?? 'cone', u.css, feedTop), overCapacity: input.tph > u.capacity, capacity: u.capacity });
      send(u.out, output, toPile(`${u.name} · crushed`, `Crushed ${u.css} mm`, `crush:${u.crusherType ?? 'cone'}:${u.css}`, u.id));
    }
  }

  // Merge piles of the same product (same size band) into one combined stockpile.
  const groups = new Map<string, Pile[]>();
  for (const p of rawPiles) {
    const g = groups.get(p.key);
    if (g) g.push(p);
    else groups.set(p.key, [p]);
  }
  const piles: Pile[] = [];
  groups.forEach((g) => {
    if (g.length === 1) piles.push(g[0]);
    else piles.push({ fromUnit: 'combined', key: g[0].key, product: g[0].product, label: `${g[0].product} (combined)`, stream: blend(g.map((x) => x.stream)) });
  });

  return { nodes, piles, feedTph: totalFeed, runaway, iterations };
}
