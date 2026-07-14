// Plant-wide max feed / bottleneck finder.
//
// Every internal stream in the routed plant (including recycle loads) scales
// linearly with the fresh feed rate when the gradations hold constant — VSMA
// required area ∝ undersize tph ∝ feed, bed depth ∝ oversize tph ∝ feed, and a
// crusher's throughput ∝ feed. So from ONE reference simulation we can scale
// each unit's binding metric to the feed at which it first hits its limit, and
// the smallest such feed is the plant's ceiling. (Realistic screening makes the
// intermediate gradations shift slightly with feed, so this is a close estimate,
// exactly as the single-screen finder is — good enough to size and debottleneck.)
import type { Plant } from '../model/plant';
import { sieveLabel } from '../model/sieves';
import { simulatePlant, type PlantResult } from './plant';

export type LimitKind = 'deck-area' | 'bed-depth' | 'crusher-capacity';

export interface PlantConstraint {
  unitId: string;
  unitName: string;
  kind: 'screen' | 'crusher';
  limit: LimitKind;
  detail: string;
  /** Fresh feed (tph) at which THIS constraint first binds. */
  maxFeedTph: number;
  /** How full this constraint is at the current feed (binds at 100%). */
  loadPct: number;
}

export interface PlantMaxFeed {
  feasible: boolean;
  runaway: boolean;
  currentFeedTph: number;
  /** Largest fresh feed with every unit within its limits (Infinity if nothing binds). */
  maxFeedTph: number;
  binding: PlantConstraint | null;
  /** All constraints, tightest (highest load) first. */
  constraints: PlantConstraint[];
}

/** Scale every feed proportionally so the total fresh feed equals `tph`. */
export const scaleFeeds = (plant: Plant, tph: number): Plant => {
  const feeds = plant.units.filter((u) => u.kind === 'feed');
  const cur = feeds.reduce((s, f) => s + (f.kind === 'feed' ? f.tph : 0), 0);
  return {
    ...plant,
    units: plant.units.map((u) => (u.kind === 'feed' ? { ...u, tph: cur > 0 ? (u.tph / cur) * tph : tph / feeds.length } : u)),
  };
};

export function plantMaxFeed(plant: Plant, result?: PlantResult): PlantMaxFeed {
  const current = plant.units.reduce((s, u) => s + (u.kind === 'feed' ? u.tph : 0), 0);
  // Reference simulation at a positive feed so ratios are well-defined even if
  // the plant is currently idling at 0 tph.
  const ref = current > 0 ? current : 100;
  const res = current > 0 && result ? result : simulatePlant(scaleFeeds(plant, ref));

  if (res.runaway) {
    return { feasible: false, runaway: true, currentFeedTph: current, maxFeedTph: 0, binding: null, constraints: [] };
  }

  const constraints: PlantConstraint[] = [];
  for (const n of res.nodes) {
    if (n.kind === 'screen') {
      n.result.decks.forEach((d, i) => {
        const label = `Deck ${i + 1} (${sieveLabel(d.aperture)})`;
        // Area: adequate while requiredArea ≤ actualArea; utilization = actual/required.
        if (Number.isFinite(d.utilization) && d.utilization > 0) {
          constraints.push({
            unitId: n.id, unitName: n.name, kind: 'screen', limit: 'deck-area',
            detail: `${label} screening area`,
            maxFeedTph: ref * d.utilization,
            loadPct: (100 / d.utilization),
          });
        }
        // Bed depth: bedDepth ∝ oversize tph ∝ feed.
        if (d.bedDepth > 0 && d.bedDepthLimit > 0) {
          constraints.push({
            unitId: n.id, unitName: n.name, kind: 'screen', limit: 'bed-depth',
            detail: `${label} bed depth`,
            maxFeedTph: ref * (d.bedDepthLimit / d.bedDepth),
            loadPct: (d.bedDepth / d.bedDepthLimit) * 100,
          });
        }
      });
    } else if (n.kind === 'crusher') {
      if (n.input.tph > 0 && n.capacity > 0) {
        constraints.push({
          unitId: n.id, unitName: n.name, kind: 'crusher', limit: 'crusher-capacity',
          detail: 'throughput vs rated capacity',
          maxFeedTph: ref * (n.capacity / n.input.tph),
          loadPct: (n.input.tph / n.capacity) * 100,
        });
      }
    }
  }

  constraints.sort((a, b) => a.maxFeedTph - b.maxFeedTph);
  const binding = constraints[0] ?? null;
  return {
    feasible: true,
    runaway: false,
    currentFeedTph: current,
    maxFeedTph: binding ? binding.maxFeedTph : Infinity,
    binding,
    constraints,
  };
}
