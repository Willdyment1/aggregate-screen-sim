// Crusher product model for closing the circuit on the top deck.
//
// Digitized from the Metso "HP Cone Crushers — Gradation Curves" chart: at an
// adequate reduction ratio the product is ~80% passing at the closed-side
// setting (CSS) and tops out around 2×CSS. Crucially, a cone only reaches that
// rated product when it has enough reduction to do (feed comfortably coarser
// than the setting). As the reduction ratio (feed top size ÷ CSS) approaches
// 1:1 the crusher barely breaks the rock — the product stays close to the feed,
// so in a closed circuit the oversize can't drain and the load runs away.
import type { Gradation } from '../model/types';
import type { CrusherType } from '../model/plant';
import { percentPassing } from './gradation';

type Norm = ReadonlyArray<readonly [number, number]>;

// Normalized HP cone product: [size / CSS, % passing]. (P80 ≈ CSS, top ≈ 2×CSS.)
// Digitized from the Metso "HP Cone Crushers — Gradation Curves" chart.
const CONE_NORM: Norm = [
  [2.0, 100], [1.5, 95], [1.2, 87], [1.0, 80], [0.85, 73], [0.7, 65], [0.55, 56],
  [0.45, 48], [0.35, 39], [0.25, 29], [0.16, 20], [0.1, 13], [0.06, 8], [0.03, 4],
];

// Jaw / gyratory: coarse primary-compression product — ~80% passing at the
// setting, top ≈ 2×setting, and few fines (Metso "Crusher selection" table:
// low fines produced). Used for both jaw and gyratory (same product shape).
const JAW_NORM: Norm = [
  [2.0, 100], [1.7, 98], [1.4, 93], [1.2, 86], [1.0, 78], [0.85, 69], [0.7, 60],
  [0.55, 50], [0.45, 42], [0.35, 33], [0.25, 24], [0.16, 15], [0.1, 9], [0.06, 5], [0.03, 2],
];

// HSI (horizontal-shaft impact): digitized from the Metso Nordberg NP-series
// production curves — ~85% passing at the apron setting, top ≈ 2.2×, and a
// heavier fines tail than a cone (impact crushers make more fines).
const HSI_NORM: Norm = [
  [2.2, 100], [1.8, 98], [1.5, 96], [1.2, 91], [1.0, 85], [0.85, 79], [0.7, 72],
  [0.55, 63], [0.45, 55], [0.35, 47], [0.25, 38], [0.16, 29], [0.1, 21], [0.06, 14], [0.03, 8],
];

export interface CrusherSpec {
  type: CrusherType;
  label: string;
  /** What the setting is called for this machine. */
  settingLabel: string;
  /** Selectable settings, mm. */
  settings: number[];
  defaultSetting: number;
  defaultCapacity: number;
  /** Typical reduction-ratio range (Metso handbook). */
  reduction: readonly [number, number];
  /** Largest feed the machine accepts, mm (Metso "Crusher selection" table). */
  maxFeed: number;
  norm: Norm;
}

/** Per-type crusher data (settings, capacity, reduction, product curve). */
export const CRUSHER_SPECS: Record<CrusherType, CrusherSpec> = {
  jaw: { type: 'jaw', label: 'Jaw', settingLabel: 'CSS', settings: [40, 50, 63, 75, 90, 100, 125, 150, 175, 200, 250], defaultSetting: 100, defaultCapacity: 400, reduction: [3, 5], maxFeed: 1400, norm: JAW_NORM },
  gyratory: { type: 'gyratory', label: 'Gyratory', settingLabel: 'OSS', settings: [100, 125, 150, 175, 200, 225, 250, 300], defaultSetting: 150, defaultCapacity: 1000, reduction: [6, 8], maxFeed: 1500, norm: JAW_NORM },
  cone: { type: 'cone', label: 'Cone', settingLabel: 'CSS', settings: [6, 8, 10, 13, 16, 19, 22, 25, 32, 38, 51], defaultSetting: 13, defaultCapacity: 200, reduction: [3, 4], maxFeed: 450, norm: CONE_NORM },
  hsi: { type: 'hsi', label: 'HSI', settingLabel: 'Apron', settings: [15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200], defaultSetting: 40, defaultCapacity: 500, reduction: [5, 10], maxFeed: 1500, norm: HSI_NORM },
};

/** Order for the crusher-type dropdown (feed-coarse → feed-fine). */
export const CRUSHER_TYPE_LIST: CrusherType[] = ['jaw', 'gyratory', 'cone', 'hsi'];

/** Legacy export (cone settings) still used by the single-screen tools. */
export const CRUSHER_SETTINGS = CRUSHER_SPECS.cone.settings;

/**
 * Gradation of crushed product for a given closed-side setting (mm), given the
 * material actually entering the crusher. Effectiveness `e` scales from 0 (no
 * reduction at ~1:1 ratio) to 1 (full rated curve at ≥2:1). Product is never
 * coarser than the feed (crushing only reduces).
 */
export function crusherProduct(css: number, crusherFeed: Gradation, type: CrusherType = 'cone'): Gradation {
  const NORM = (CRUSHER_SPECS[type] ?? CRUSHER_SPECS.cone).norm;
  const c = css > 0 ? css : 25;
  const feedTop = crusherFeed.length ? Math.max(...crusherFeed.map((p) => p.size)) : c * 2;
  const rr = feedTop / c; // reduction ratio
  const e = Math.min(1, Math.max(0, rr - 1)); // 0 at RR≤1, ramps to 1 at RR≥2

  const cssCurve: Gradation = NORM.map(([r, p]) => ({ size: +(c * r).toFixed(3), percentPassing: p }));

  const sizes = new Set<number>();
  crusherFeed.forEach((p) => sizes.add(p.size));
  cssCurve.forEach((p) => sizes.add(p.size));
  const sorted = [...sizes].filter((s) => s > 0).sort((a, b) => b - a);

  return sorted.map((x) => {
    const fp = percentPassing(crusherFeed, x); // feed % passing (product is at least this fine)
    const cp = percentPassing(cssCurve, x); // rated crushed % passing
    return { size: x, percentPassing: fp + e * Math.max(0, cp - fp) };
  });
}
