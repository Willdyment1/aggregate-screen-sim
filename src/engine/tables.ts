// ============================================================================
//  VSMA COEFFICIENT TABLES  --  transcribed from the VSMA Handbook
//  "Factors for Calculating Screen Area" (9-factor method).
//
//    Screening Area (ft^2) = U / (A x B x C x D x E x F x G x H x I)
//    U = tph of UNDERSIZE (material passing the deck opening)
//
//  Basic operating conditions the tables are normalized to:
//    25% oversize, 40% halfsize, granular free-flowing material,
//    100 lb/ft^3, 95% objective efficiency.
//
//  Values below are transcribed from photographs of the Handbook and are
//  cross-checked against the Handbook's own worked example (see engine.test.ts,
//  which reproduces its 48 / 93 / 111 ft^2 results exactly).
// ============================================================================

// Real Handbook data is in place. A few `% open area` values for openings NOT
// exercised by the worked example are marked below with `VERIFY` and should be
// double-checked against a clearer scan; they only affect Factor G when a
// non-standard cloth is used.
export const USING_SAMPLE_DATA = false;

/** A monotonic lookup table of (x -> y) pairs, ascending in x. */
export type LookupTable = ReadonlyArray<readonly [x: number, y: number]>;

/** Linear interpolation over a lookup table; clamps outside the range. */
export function lookup(table: LookupTable, x: number): number {
  if (table.length === 0) return 1;
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

// --- Factor A: basic capacity + standard open area, keyed by square opening --
//     [opening(in), tph passing per ft^2, % open area]
//     The % open area column is the "open area indicated in capacity" used as
//     the Factor G denominator. Ascending in opening for interpolation.
export interface FactorARow {
  opening: number;
  stphPerSqFt: number;
  openAreaPct: number;
}
export const FACTOR_A: readonly FactorARow[] = [
  { opening: 0.03125, stphPerSqFt: 0.39, openAreaPct: 41 }, // 1/32"  VERIFY OA
  { opening: 0.0625, stphPerSqFt: 0.58, openAreaPct: 37 }, //  1/16"  VERIFY OA
  { opening: 0.09375, stphPerSqFt: 0.76, openAreaPct: 45 }, // 3/32"  VERIFY OA
  { opening: 0.125, stphPerSqFt: 0.95, openAreaPct: 40 }, //   1/8"   VERIFY OA
  { opening: 0.1875, stphPerSqFt: 1.27, openAreaPct: 45 }, //  3/16"  VERIFY OA
  { opening: 0.25, stphPerSqFt: 1.6, openAreaPct: 46 }, //     1/4"   (example: confirmed)
  { opening: 0.375, stphPerSqFt: 2.08, openAreaPct: 51 }, //   3/8"
  { opening: 0.5, stphPerSqFt: 2.47, openAreaPct: 54 }, //     1/2"   (example: confirmed)
  { opening: 0.625, stphPerSqFt: 2.82, openAreaPct: 59 }, //   5/8"
  { opening: 0.75, stphPerSqFt: 3.08, openAreaPct: 61 }, //    3/4"
  { opening: 0.875, stphPerSqFt: 3.38, openAreaPct: 63 }, //   7/8"
  { opening: 1.0, stphPerSqFt: 3.56, openAreaPct: 64 }, //     1"     (example: confirmed)
  { opening: 1.25, stphPerSqFt: 3.89, openAreaPct: 66 }, //    1-1/4"
  { opening: 1.5, stphPerSqFt: 4.2, openAreaPct: 69 }, //      1-1/2"
  { opening: 1.75, stphPerSqFt: 4.51, openAreaPct: 68 }, //    1-3/4"
  { opening: 2.0, stphPerSqFt: 4.9, openAreaPct: 71 }, //      2"
  { opening: 2.5, stphPerSqFt: 5.85, openAreaPct: 74 }, //     2-1/2"  VERIFY OA
  { opening: 3.0, stphPerSqFt: 6.17, openAreaPct: 74 }, //     3"      VERIFY OA
  { opening: 3.5, stphPerSqFt: 7.03, openAreaPct: 77 }, //     3-1/2"  VERIFY OA
  { opening: 4.0, stphPerSqFt: 7.69, openAreaPct: 75 }, //     4"      VERIFY OA
];

/** Factor A basic capacity (tph/ft^2) for an opening, interpolated. */
export function basicCapacity(opening: number): number {
  return lookup(
    FACTOR_A.map((r) => [r.opening, r.stphPerSqFt] as const),
    opening,
  );
}

/** Standard % open area for an opening (Factor G denominator), interpolated. */
export function standardOpenArea(opening: number): number {
  return lookup(
    FACTOR_A.map((r) => [r.opening, r.openAreaPct] as const),
    opening,
  );
}

// --- Factor B: percent oversize in feed to the deck --------------------------
export const FACTOR_B_OVERSIZE: LookupTable = [
  [5, 1.21],
  [10, 1.13],
  [15, 1.08],
  [20, 1.02],
  [25, 1.0],
  [30, 0.96],
  [35, 0.92],
  [40, 0.88],
  [45, 0.84],
  [50, 0.79],
  [55, 0.75],
  [60, 0.7],
  [65, 0.66],
  [70, 0.62],
  [75, 0.58],
  [80, 0.53],
  [85, 0.5],
  [90, 0.46],
  [95, 0.33],
];

// --- Factor C: percent halfsize (finer than half the opening) in feed --------
export const FACTOR_C_HALFSIZE: LookupTable = [
  [0, 0.4],
  [5, 0.45],
  [10, 0.5],
  [15, 0.55],
  [20, 0.6],
  [25, 0.7],
  [30, 0.8],
  [35, 0.9],
  [40, 1.0],
  [45, 1.1],
  [50, 1.2],
  [55, 1.3],
  [60, 1.4],
  [65, 1.55],
  [70, 1.7],
  [75, 1.85],
  [80, 2.0],
  [85, 2.2],
  [90, 2.4],
];

// --- Factor D: deck location (1 = top) ---------------------------------------
export const FACTOR_D_DECK: Record<number, number> = {
  1: 1.0,
  2: 0.9,
  3: 0.8,
};

// --- Factor E: wet screening, by opening (dry screening => 1.00) -------------
export const FACTOR_E_WET: LookupTable = [
  [0.03125, 1.0], // 1/32"
  [0.0625, 1.25], // 1/16"
  [0.125, 2.0], //   1/8"
  [0.1875, 2.5], //  3/16"
  [0.25, 2.0], //    1/4"
  [0.375, 1.75], //  3/8"
  [0.5, 1.4], //     1/2"
  [0.75, 1.3], //    3/4"
  [1.0, 1.25], //    1"
];

// --- Factor F: material weight. Ratio of bulk density to 100 lb/ft^3. --------
//     Table is exactly bulkDensity/100 (150->1.50 ... 30->0.30).
export function factorF(bulkDensity: number): number {
  return bulkDensity / 100;
}

// --- Factor G: screen surface open area --------------------------------------
//     G = (actual % open area of cloth used) / (standard % open area for opening)
export function factorG(actualOpenAreaPct: number, opening: number): number {
  return actualOpenAreaPct / standardOpenArea(opening);
}

// --- Factor H: shape of surface opening --------------------------------------
export const FACTOR_H_SHAPE: Record<string, number> = {
  square: 1.0,
  shortSlot: 1.15, // 3 to 4 times width
  longSlot: 1.25, //  more than 4 times width
};

// --- Factor I: efficiency (objective screening efficiency %) -----------------
// 70–95% are the VSMA Handbook values. 50–65% are EXTRAPOLATED below the
// handbook (continuing the ~-0.04/% slope) so dirtier screening can be modelled;
// treat those as estimates, not published figures.
export const FACTOR_I_EFFICIENCY: LookupTable = [
  [50, 2.7], // extrapolated
  [55, 2.5], // extrapolated
  [60, 2.3], // extrapolated
  [65, 2.1], // extrapolated
  [70, 1.9],
  [75, 1.7],
  [80, 1.5],
  [85, 1.35],
  [90, 1.15],
  [95, 1.0],
];
