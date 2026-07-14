// Cone-crusher operating limits.
//
// Cone crushers manage roughly a 4:1–6:1 reduction ratio (this cone ~4:1). Push
// past that (CSS too small for the feed) and the chamber chokes / ring-bounces
// and makes oversized product. Set it too coarse (CSS ≈ feed) and it barely
// reduces the rock. Reduction ratio = feed top size ÷ product size (≈ CSS).
// Sources: McLanahan, Metso, 911Metallurgist, Pit&Quarry (see chat).
import type { Project, SimulationResult } from '../model/types';
import { sieveLabel } from '../model/sieves';

export const MAX_REDUCTION = 4; // this cone's limit
const MIN_REDUCTION = 1.5; // below this it's barely crushing

export interface CrusherStatus {
  active: boolean;
  level: 'ok' | 'warn' | 'fail';
  reductionRatio: number;
  message: string;
}

export function crusherStatus(project: Project, result: SimulationResult): CrusherStatus {
  const idle: CrusherStatus = { active: false, level: 'ok', reductionRatio: 0, message: '' };
  if (!result.closedCircuit || project.screen.decks.length === 0 || result.recirculationTph < 0.5) {
    return idle;
  }

  const css = project.crusher.css ?? 25;
  const topAp = project.screen.decks[0].aperture;
  const feedTop = Math.max(0, ...project.feed.gradation.map((p) => p.size));
  const rr = css > 0 ? feedTop / css : Infinity;
  const circ = result.circulatingLoadPct;

  // Most severe first.
  if (rr > MAX_REDUCTION) {
    return {
      active: true,
      level: 'fail',
      reductionRatio: rr,
      message: `Crusher can't do this — reducing the ${feedTop.toFixed(0)} mm feed to a ${css} mm setting is a ${rr.toFixed(1)}:1 ratio, past this cone's ~${MAX_REDUCTION}:1 limit. It would choke, ring-bounce and produce oversized rock. Open the setting up.`,
    };
  }
  if (circ > 100) {
    return {
      active: true,
      level: 'fail',
      reductionRatio: rr,
      message: `Circuit fills up — at only a ${rr.toFixed(1)}:1 reduction the crusher barely breaks the ${feedTop.toFixed(0)} mm feed, so the oversize can't get below the ${sieveLabel(topAp)} deck and keeps cycling. The recirculating load runs to ${circ.toFixed(0)}% of fresh feed and would choke the plant. Use a setting finer than the deck opening.`,
    };
  }
  if (rr < MIN_REDUCTION) {
    return {
      active: true,
      level: 'warn',
      reductionRatio: rr,
      message: `Crusher barely crushing — the ${css} mm setting is nearly as big as the ${feedTop.toFixed(0)} mm feed (only ${rr.toFixed(1)}:1), so much of the oversize just cycles (load ${circ.toFixed(0)}%). Use a setting finer than the ${sieveLabel(topAp)} deck.`,
    };
  }
  if (circ > 40) {
    return {
      active: true,
      level: 'warn',
      reductionRatio: rr,
      message: `High recirculating load (${circ.toFixed(0)}%) — the crusher setting (${css} mm) is coarse relative to the ${sieveLabel(topAp)} deck, so a lot of product stays oversize. A finer setting reduces the load.`,
    };
  }
  return {
    active: true,
    level: 'ok',
    reductionRatio: rr,
    message: `Crusher OK — reduction ratio ${rr.toFixed(1)}:1, within the cone's range.`,
  };
}
