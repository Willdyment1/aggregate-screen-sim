// Ideal separation at the deck opening, matching the VSMA Handbook method.
// The feed to a deck splits at the aperture into:
//   - undersize (throughflow) -> feeds the next deck down
//   - oversize (overflow)      -> becomes a product
// Each product's gradation is the feed gradation renormalized to that fraction,
// which reproduces the Handbook's "theoretical analysis of feed to Nth deck".
import type { Gradation, Stream } from '../model/types';
import { normalizeGradation, percentPassing } from './gradation';

export interface Split {
  throughflow: Stream; // undersize (passes the opening)
  overflow: Stream; //    oversize (retained on the deck)
}

export function idealSplit(feedTph: number, feedGradation: Gradation, aperture: number): Split {
  const passPct = percentPassing(feedGradation, aperture); // % of feed finer than opening
  const underTph = feedTph * (passPct / 100);
  const overTph = feedTph - underTph;

  return {
    throughflow: { tph: underTph, gradation: renormalizeUndersize(feedGradation, aperture, passPct) },
    overflow: { tph: overTph, gradation: renormalizeOversize(feedGradation, aperture, passPct) },
  };
}

/** Gradation of the material passing the opening, rescaled so aperture = 100%. */
function renormalizeUndersize(g: Gradation, aperture: number, passPct: number): Gradation {
  if (passPct <= 0) return [];
  const pts = normalizeGradation(g).filter((p) => p.size < aperture);
  const out: Gradation = [{ size: aperture, percentPassing: 100 }];
  for (const p of pts) {
    out.push({ size: p.size, percentPassing: (p.percentPassing / passPct) * 100 });
  }
  return out;
}

/** Gradation of the material retained on the opening, rescaled to 0-100%. */
function renormalizeOversize(g: Gradation, aperture: number, passPct: number): Gradation {
  const overPct = 100 - passPct;
  if (overPct <= 0) return [];
  const pts = normalizeGradation(g).filter((p) => p.size > aperture);
  const out: Gradation = [];
  for (const p of pts) {
    // Fraction of the oversize that is finer than this (larger) sieve.
    out.push({ size: p.size, percentPassing: ((p.percentPassing - passPct) / overPct) * 100 });
  }
  out.push({ size: aperture, percentPassing: 0 });
  return normalizeGradation(out);
}
