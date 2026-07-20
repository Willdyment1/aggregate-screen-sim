// Gradation (sieve analysis) math. Pure functions, no UI, fully testable.
import type { Gradation, SievePoint } from '../model/types';

/** Sort a gradation by descending sieve size and clamp percentages to [0,100]. */
export function normalizeGradation(g: Gradation): Gradation {
  return [...g]
    .map((p) => ({ size: p.size, percentPassing: clamp(p.percentPassing, 0, 100) }))
    .sort((a, b) => b.size - a.size);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Percent of material passing a given size, by log-linear interpolation on the
 * gradation curve. Particle-size distributions are near-linear in log space, so
 * we interpolate percentPassing against log(size).
 */
export function percentPassing(g: Gradation, size: number): number {
  const pts = normalizeGradation(g);
  if (pts.length === 0) return 0;
  // Above the coarsest sieve -> everything passes (100%). At/below finest -> its value.
  const coarsest = pts[0];
  const finest = pts[pts.length - 1];
  if (size >= coarsest.size) return coarsest.percentPassing;
  if (size <= finest.size) return finest.percentPassing;

  // Find the bracketing pair (descending order, so p0.size > p1.size).
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    if (size <= p0.size && size >= p1.size) {
      return interpLog(p0, p1, size);
    }
  }
  return finest.percentPassing;
}

function interpLog(p0: SievePoint, p1: SievePoint, size: number): number {
  // Interpolate percentPassing linearly in log(size).
  const l0 = Math.log(p0.size);
  const l1 = Math.log(p1.size);
  const l = Math.log(size);
  if (l0 === l1) return (p0.percentPassing + p1.percentPassing) / 2;
  const t = (l - l0) / (l1 - l0);
  return p0.percentPassing + t * (p1.percentPassing - p0.percentPassing);
}

/** Percent retained on (i.e. larger than) a given size. */
export function percentRetained(g: Gradation, size: number): number {
  return 100 - percentPassing(g, size);
}

/**
 * Inverse of percentPassing: the sieve size at which `pct` percent passes (e.g.
 * P80, P50/median). Log-linear interpolation, mirroring percentPassing.
 */
/** The largest particle size actually present: the finest sieve that still passes
 *  ~100% (everything is below it). Avoids reporting a "top size" at a coarse point
 *  that carries no material — e.g. a #4 undersize whose coarse rows all read 100%. */
export function topSize(g: Gradation): number {
  if (!g.length) return 0;
  const sorted = [...g].sort((a, b) => b.size - a.size);
  let top = sorted[0].size;
  for (const pt of sorted) { if (pt.percentPassing >= 99.95) top = pt.size; else break; }
  return top;
}

export function sizeAtPassing(g: Gradation, pct: number): number {
  const pts = normalizeGradation(g); // descending size => descending %passing
  if (pts.length === 0) return 0;
  const coarsest = pts[0];
  const finest = pts[pts.length - 1];
  if (pct >= coarsest.percentPassing) return coarsest.size;
  if (pct <= finest.percentPassing) return finest.size;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]; // coarser, higher %passing
    const p1 = pts[i + 1]; // finer, lower %passing
    if (pct <= p0.percentPassing && pct >= p1.percentPassing) {
      if (p1.percentPassing === p0.percentPassing) return p0.size;
      const t = (pct - p0.percentPassing) / (p1.percentPassing - p0.percentPassing);
      return Math.exp(Math.log(p0.size) + t * (Math.log(p1.size) - Math.log(p0.size)));
    }
  }
  return finest.size;
}

/**
 * VSMA "oversize": percent of feed LARGER than the deck aperture.
 * These are the particles the deck must reject.
 */
export function percentOversize(g: Gradation, aperture: number): number {
  return percentRetained(g, aperture);
}

/**
 * VSMA "half-size": percent of feed SMALLER than HALF the deck aperture.
 * More half-size material screens faster (Factor C).
 */
export function percentHalfSize(g: Gradation, aperture: number): number {
  return percentPassing(g, aperture / 2);
}

/**
 * VSMA "near-size": percent of feed between half-aperture and aperture.
 * These "difficult" particles are near the cut point (Factor J).
 */
export function percentNearSize(g: Gradation, aperture: number): number {
  return percentPassing(g, aperture) - percentPassing(g, aperture / 2);
}

/** Percent of feed that should pass the aperture (the undersize target). */
export function percentUndersize(g: Gradation, aperture: number): number {
  return percentPassing(g, aperture);
}

/**
 * Blend several tonnage-weighted streams into one combined gradation.
 * The combined %passing at each size is the tonnage-weighted average of the
 * inputs' %passing at that size, evaluated over the union of all sieve sizes.
 */
export function blendGradations(streams: { tph: number; gradation: Gradation }[]): Gradation {
  const active = streams.filter((s) => s.tph > 0 && s.gradation.length > 0);
  const totalTph = active.reduce((s, x) => s + x.tph, 0);
  if (totalTph <= 0) return [];

  const sizes = new Set<number>();
  for (const s of active) for (const p of s.gradation) sizes.add(p.size);
  const sorted = [...sizes].sort((a, b) => b - a);

  return sorted.map((size) => {
    const weighted = active.reduce((acc, s) => acc + s.tph * percentPassing(s.gradation, size), 0);
    return { size, percentPassing: weighted / totalTph };
  });
}
