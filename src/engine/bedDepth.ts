// Discharge-end bed depth check (VSMA Handbook).
//
//   DBD (in) = (O x C) / (5 x T x W)
//
//   O = tph of oversize carried over the discharge end
//   C = 20 (Handbook constant for 100 lb/ft^3) — bed depth is inversely
//       proportional to bulk density: for a fixed tph, denser material occupies
//       less volume, so C scales as 100/density.
//   T = travel rate over the deck, ft/min
//   W = deck width, ft
//
// Rule of thumb: bed depth at the discharge end should not exceed ~4x the
// opening (some references use 2.5-3x for efficient screening).
const HANDBOOK_C = 20;
const MM_PER_IN = 25.4;

/**
 * VSMA guideline for the maximum bed depth at the discharge end: it should not
 * exceed ~4x the opening (deeper beds bury near-size material and cut efficiency).
 */
export const BED_DEPTH_LIMIT_RATIO = 4;

/** Discharge-end bed depth, in millimetres. */
export function bedDepth(
  oversizeTph: number,
  travelRate: number,
  width: number,
  bulkDensity = 100,
): number {
  if (travelRate <= 0 || width <= 0) return 0;
  const density = bulkDensity > 0 ? bulkDensity : 100;
  const c = HANDBOOK_C * (100 / density);
  const inches = (oversizeTph * c) / (5 * travelRate * width);
  return inches * MM_PER_IN;
}
