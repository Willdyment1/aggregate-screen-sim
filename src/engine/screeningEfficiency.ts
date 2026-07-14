// Achieved (real) screening efficiency for a deck.
//
// The "design efficiency" is the target you SIZE for. What a deck actually
// achieves is lower, and falls further under adverse operating conditions. We
// model the three dominant, well-established drivers and subtract their
// penalties from the design value:
//
//   • Bed depth — a thick bed stops particles stratifying down to the cloth.
//     Screening stays efficient up to ~3× the opening, then degrades.
//   • Near-size content — particles between ½× and 1× the opening ("near-size")
//     are the hardest to pass; the more of them, the poorer the separation.
//   • Loading — running a deck near or past its rated capacity crowds the cloth
//     and drops efficiency.
//
// Wet screening (spray water) recovers some of the near-size loss by washing
// fines through. The penalties are engineering heuristics (bounded, monotonic,
// directionally correct) — not published coefficients — so achieved efficiency
// is an estimate. Result is clamped to [EFF_FLOOR, designEff].
import { BED_DEPTH_LIMIT_RATIO } from './bedDepth';

export const EFF_FLOOR = 40;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface EfficiencyInputs {
  /** Design/objective efficiency (%), the achievable ceiling. */
  designEff: number;
  /** Discharge-end bed depth (mm). */
  bedDepthMm: number;
  /** Deck opening (mm). */
  aperture: number;
  /** Fraction of the deck feed that is near-size (½×..1× opening), 0–1. */
  nearSizeFrac: number;
  /** Deck loading = required area ÷ actual area (≥1 means overloaded). */
  loading: number;
  /** Wet screening with sprays. */
  wet: boolean;
}

export interface EfficiencyResult {
  efficiency: number;
  bedPenalty: number;
  nearPenalty: number;
  loadPenalty: number;
}

export function achievedEfficiency(inp: EfficiencyInputs): EfficiencyResult {
  const { designEff, bedDepthMm, aperture, nearSizeFrac, loading, wet } = inp;

  const bedRatio = aperture > 0 ? bedDepthMm / aperture : 0;
  // Good up to ~3× opening; ~6%/× beyond, and steeper past the ~4× limit.
  const overBed = Math.max(0, bedRatio - 3);
  const bedPenalty = clamp(overBed * 6 + Math.max(0, bedRatio - BED_DEPTH_LIMIT_RATIO) * 6, 0, 30);

  // Near-size: up to ~25% loss at all-near-size feed; sprays halve it.
  const nearPenalty = clamp(nearSizeFrac * 25 * (wet ? 0.5 : 1), 0, 20);

  // Loading: nothing under 80% of capacity, then falls to overloaded.
  const loadPenalty = clamp((loading - 0.8) * 30, 0, 25);

  const efficiency = clamp(designEff - bedPenalty - nearPenalty - loadPenalty, EFF_FLOOR, designEff);
  return { efficiency, bedPenalty, nearPenalty, loadPenalty };
}
