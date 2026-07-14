// Max-feed solver: the largest fresh feed rate the circuit can take before
// EITHER the crusher or the screen overflows.
//
// Two limits move in opposite directions as you push more feed in:
//   • Screen  — every deck must stay adequate (VSMA utilization >= 1) and within
//     its bed-depth limit. Required area grows with feed, so past some rate the
//     tightest deck can no longer pass its undersize -> the screen "overflows".
//   • Crusher — its throughput is the recirculating load (the top-deck oversize
//     it re-crushes). That load scales with feed, so past some rate it exceeds
//     the crusher's rated capacity (e.g. an HP 300 at 200 tph) -> it backs up.
//
// Everything downstream scales EXACTLY LINEARLY with fresh feed: gradations are
// fixed for a given CSS (the crusher-product curve and the fresh feed don't
// change with tonnage), so the circulating-load ratio, every VSMA divisor, and
// the bed-depth-per-tph are all constants — only tonnages scale. That lets us
// solve in closed form from ONE reference simulation instead of iterating:
//   • util_i(F) = util_i(REF)·REF/F   -> deck i hits util=1 at F = REF·util_i(REF)
//   • bd_i(F)   = bd_i(REF)·F/REF     -> hits its limit at F = REF·limit_i/bd_i(REF)
//   • recirc(F) = ρ·F, ρ = recirc(REF)/REF -> hits capacity at F = capacity/ρ
// maxFeed is the smallest of those. A runaway (unstable) circuit is detected by
// the fixed-point guard tripping in the reference sim and reported as infeasible.
import type { Project, SimulationResult } from '../model/types';
import { simulate } from './simulate';

export const DEFAULT_CRUSHER_CAPACITY_TPH = 200; // Metso HP 300 class

/** Which limit stops you from feeding more. */
export type Binding = 'crusher' | 'screen' | 'both' | 'none';

export interface MaxFeedResult {
  /** Largest fresh feed (tph) with neither the crusher nor the screen overflowing. */
  maxFeedTph: number;
  /** What binds first at that feed. */
  binding: Binding;
  /** Crusher capacity used for the crusher limit (tph). */
  capacityTph: number;
  /** Crusher throughput (recirculating load) at maxFeed (tph). */
  crusherThroughputTph: number;
  /** Circulating load ratio at maxFeed (%). */
  circulatingLoadPct: number;
  /** Index of the deck that limits the screen (lowest utilization) at maxFeed. */
  tightestDeck: number;
  /** Whether the screen limit is bed depth (vs. screening area) on that deck. */
  screenLimitedByBedDepth: boolean;
  /** The full simulation at maxFeed, for drill-down. */
  atMax: SimulationResult;
  /**
   * False when the circuit is unstable (runaway circulating load) so that even a
   * negligible feed overflows the crusher — no practical feed works.
   */
  feasible: boolean;
}

/** Reference feed for the single sizing simulation (arbitrary — results scale). */
const REF_TPH = 100;

/**
 * Find the maximum fresh feed for a project. Does not mutate the project; runs
 * the simulation once at a reference feed and scales the limits in closed form.
 */
export function findMaxFeed(
  project: Project,
  capacityTph: number = project.crusher.maxTph ?? DEFAULT_CRUSHER_CAPACITY_TPH,
): MaxFeedResult {
  const ref = simulate({ ...project, feed: { ...project.feed, tph: REF_TPH } });

  // Circulating-load ratio ρ = recirc / fresh, constant for a given CSS.
  const rho = ref.closedCircuit && REF_TPH > 0 ? ref.recirculationTph / REF_TPH : 0;

  // Runaway (unstable) circuit: the crusher can't reduce the rock enough, so the
  // circulating load balloons (here >1000% of fresh, i.e. ρ>10, or the fixed-
  // point guard tripped). No practical operating point exists -> infeasible.
  const runaway = ref.closedCircuit && rho > 10;

  // Screen limit: for each deck, the feed at which it first fails (area OR bed
  // depth). Keep the tightest deck and whether bed depth is what bit.
  let fScreen = Infinity;
  let tightestDeck = 0;
  let screenLimitedByBedDepth = false;
  ref.decks.forEach((d, i) => {
    const fArea = REF_TPH * d.utilization; // util = actualArea/reqArea, ∝ 1/F
    const fBed = d.bedDepth > 0 ? (REF_TPH * d.bedDepthLimit) / d.bedDepth : Infinity;
    const fDeck = Math.min(fArea, fBed);
    if (fDeck < fScreen) {
      fScreen = fDeck;
      tightestDeck = i;
      screenLimitedByBedDepth = fBed < fArea;
    }
  });

  // Crusher limit: recirculating load ρ·F reaches capacity at F = capacity/ρ.
  const fCrusher = rho > 0 ? capacityTph / rho : Infinity;

  const maxFeedTph = runaway ? 0 : Math.max(0, Math.min(fScreen, fCrusher));

  // Binding constraint: the smaller limit, or 'both' when they're within 2%.
  let binding: Binding;
  if (runaway) binding = 'crusher';
  else if (!Number.isFinite(fScreen) && !Number.isFinite(fCrusher)) binding = 'none';
  else if (Math.abs(fScreen - fCrusher) <= 0.02 * Math.min(fScreen, fCrusher)) binding = 'both';
  else binding = fCrusher < fScreen ? 'crusher' : 'screen';

  return {
    maxFeedTph,
    binding,
    capacityTph,
    crusherThroughputTph: rho * maxFeedTph,
    circulatingLoadPct: rho * 100,
    tightestDeck,
    screenLimitedByBedDepth,
    atMax: maxFeedTph > 0 ? simulate({ ...project, feed: { ...project.feed, tph: maxFeedTph } }) : ref,
    feasible: !runaway && maxFeedTph > 1e-6,
  };
}

export interface SweepRow {
  css: number;
  result: MaxFeedResult;
}

/**
 * Max feed for each crusher setting (grading), so you can see how the achievable
 * feed changes with CSS. Forces the closed circuit on so every setting is
 * evaluated as a real recirculating case.
 */
export function sweepMaxFeed(
  project: Project,
  settings: number[],
  capacityTph: number = project.crusher.maxTph ?? DEFAULT_CRUSHER_CAPACITY_TPH,
): SweepRow[] {
  return settings.map((css) => ({
    css,
    result: findMaxFeed(
      { ...project, closedCircuit: true, crusher: { ...project.crusher, css } },
      capacityTph,
    ),
  }));
}
