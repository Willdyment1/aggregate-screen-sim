// Realistic (non-ideal) screening via a partition (Tromp) curve.
//
// A real deck does not cut perfectly at the opening: some undersize is carried
// over into the oversize, and some near-size sneaks through. We model the
// probability that a particle of size d reports to OVERSIZE with Whiten's
// efficiency curve, cutting at d50 = the opening, with a sharpness set by the
// deck's screening efficiency (sharper = closer to an ideal cut):
//
//     Eo(d) = (e^(a d/d50) - 1) / (e^(a d/d50) + e^a - 2)
//
// Eo(0)=0, Eo(d50)=0.5, Eo(inf)=1. Large a -> sharp/ideal.
//
// The result: product gradations gain realistic "tails" instead of the vertical
// bands produced by an ideal cut, and tonnages shift by the misplaced material.
// Mass is conserved. This is used only for the product streams; the VSMA sizing
// numerator U stays the ideal undersize (see simulate.ts).
import type { Gradation, Stream } from '../model/types';
import { normalizeGradation, percentPassing } from './gradation';
import type { Split } from './separation';

/**
 * Map screening efficiency (%) to Whiten sharpness `a`. 70–95% is the VSMA
 * calibrated range (a 4..13, sharp). 50–70% extends BELOW the handbook to let
 * you model dirty/blinded decks — the curve keeps flattening (a 2..4), so the
 * product lines S-curve much more (more misplaced material).
 */
export function sharpnessFromEfficiency(efficiency: number): number {
  const e = Math.min(95, Math.max(50, efficiency));
  return e >= 70
    ? 4 + ((e - 70) * (13 - 4)) / (95 - 70) // 4 .. 13 (calibrated)
    : 2 + ((e - 50) * (4 - 2)) / (70 - 50); // 2 .. 4 (extrapolated, flatter)
}

/** Probability a particle of size d reports to oversize (retained on deck). */
export function partitionToOversize(d: number, d50: number, a: number): number {
  if (d <= 0 || d50 <= 0) return 0;
  const x = a * (d / d50);
  // Eo(∞) = 1. For large x, e^x overflows to Infinity → Inf/Inf = NaN, so return
  // the curve's limit directly (a coarse particle is certainly retained).
  if (x >= 700) return 1;
  const num = Math.exp(x) - 1;
  const den = Math.exp(x) + Math.exp(a) - 2;
  if (den <= 0) return 0;
  return Math.min(1, Math.max(0, num / den));
}

interface Bin {
  size: number; // representative (geometric-mean) size, mm
  massFraction: number; // 0-1
  lo: number;
  hi: number;
}

// A particle sieve-sized ABOVE the opening cannot pass a square hole — the one
// exception is a thin band just above the opening, where an elongated/flaky
// particle can present a cross-section small enough to slip through. We let that
// band (up to SHAPE_BAND above the opening) leak, tapering to zero at its edge,
// and hold everything coarser firmly in the oversize. This is the physical wall
// the symmetric partition curve alone doesn't enforce.
const SHAPE_BAND = 0.2;

/** Discretise a cumulative gradation into mass bins (with the opening injected). */
function toBins(g: Gradation, aperture: number): Bin[] {
  const pts = normalizeGradation(g);
  if (pts.length === 0) return [];
  const sizes = new Set<number>(pts.map((p) => p.size));
  sizes.add(aperture);
  sizes.add(aperture / 2);
  // The edge of the shape band just above the opening — its own bin, so the thin
  // sliver of near-aperture material that can slip through isn't lumped in with
  // material too coarse to ever pass (see the SHAPE_BAND wall in realisticSplit).
  sizes.add(aperture * (1 + SHAPE_BAND));
  const sorted = [...sizes].sort((a, b) => b - a);

  const bins: Bin[] = [];
  // Any material coarser than the top listed size (a feed whose coarsest point is
  // < 100% passing) is certainly oversize — capture it so mass is conserved.
  const aboveTop = (100 - percentPassing(g, sorted[0])) / 100;
  if (aboveTop > 1e-9) bins.push({ size: sorted[0] * 1.5, massFraction: aboveTop, lo: sorted[0], hi: sorted[0] * 2 });
  for (let i = 0; i < sorted.length - 1; i++) {
    const hi = sorted[i];
    const lo = sorted[i + 1];
    const mass = (percentPassing(g, hi) - percentPassing(g, lo)) / 100;
    if (mass <= 0) continue;
    bins.push({ size: Math.sqrt(hi * lo), massFraction: mass, lo, hi });
  }
  const finest = sorted[sorted.length - 1];
  const finesMass = percentPassing(g, finest) / 100;
  if (finesMass > 0) bins.push({ size: finest / 2, massFraction: finesMass, lo: 0, hi: finest });
  return bins;
}

/** Rebuild a cumulative gradation from mass bins. */
function binsToGradation(bins: Bin[]): Gradation {
  const total = bins.reduce((s, b) => s + b.massFraction, 0);
  if (total <= 0) return [];
  const sizes = new Set<number>();
  for (const b of bins) {
    sizes.add(b.hi);
    sizes.add(b.lo);
  }
  const sorted = [...sizes].filter((s) => s > 0).sort((a, b) => b - a);
  return sorted.map((size) => {
    const finer = bins.filter((b) => b.hi <= size).reduce((s, b) => s + b.massFraction, 0);
    return { size, percentPassing: (finer / total) * 100 };
  });
}

/** Non-ideal split of a stream across one deck using the partition curve. */
export function realisticSplit(
  feedTph: number,
  feedGradation: Gradation,
  aperture: number,
  efficiency: number,
): Split {
  const a = sharpnessFromEfficiency(efficiency);
  const bins = toBins(feedGradation, aperture);
  const overBins: Bin[] = [];
  const underBins: Bin[] = [];
  let overMass = 0;
  let underMass = 0;

  for (const b of bins) {
    const pOver = partitionToOversize(b.size, aperture, a);
    let pUnder = 1 - pOver;
    // Physical wall: a particle coarser than the opening can't pass a square hole.
    // Suppress pass-through above the opening, tapering to zero at the edge of the
    // shape band (~1.2× the opening). Below the opening the curve is untouched —
    // that (fines carried over into the oversize) is the real, dominant misplacement.
    if (b.size > aperture) {
      const excess = (b.size - aperture) / aperture;
      pUnder *= Math.max(0, 1 - excess / SHAPE_BAND);
    }
    const under = b.massFraction * pUnder;
    const over = b.massFraction - under;
    if (over > 0) overBins.push({ ...b, massFraction: over });
    if (under > 0) underBins.push({ ...b, massFraction: under });
    overMass += over;
    underMass += under;
  }

  const overflow: Stream = { tph: feedTph * overMass, gradation: binsToGradation(overBins) };
  const throughflow: Stream = { tph: feedTph * underMass, gradation: binsToGradation(underBins) };
  return { throughflow, overflow };
}
