// Routed plant graph: a set of units whose outputs are each wired to a target —
// another unit (by id) or PILE (a product stockpile). Branching and recycle
// loops (e.g. a deck's oversize → crusher → back to a screen) are both allowed;
// the solver converges the loops.
import type { Deck, Gradation } from './types';
import { sieveLabel } from './sieves';
import { FEED_PRESETS } from './feedPresets';

/** Output target: another unit's id, or a product pile. */
export type Target = string;
export const PILE: Target = 'pile';
/** Sentinel target: fold this output's stream into a sibling output of the same
 *  unit (a screen's oversize → its undersize) instead of piling it separately.
 *  Set when the user deletes a stream that has no split-branch to absorb it, so
 *  the tonnage is conserved rather than dropped. */
export const MERGE: Target = 'merge';

/** One weighted destination for an output. `frac` is 0..1; the routes for a
 *  single output should sum to ~1 (a splitter divides the stream by mass). */
export interface Route {
  to: Target;
  frac: number;
}
/** Where one output goes — one destination, or several split by fraction. */
export type Split = Route[];

/** A split that sends the whole stream to one target. */
export const one = (t: Target): Split => [{ to: t, frac: 1 }];

/** Crusher machine type (each has its own product curve / settings / capacity). */
export type CrusherType = 'jaw' | 'gyratory' | 'cone' | 'hsi' | 'vsi';
export const CRUSHER_TYPE_LABEL: Record<CrusherType, string> = { jaw: 'Jaw', gyratory: 'Gyratory', cone: 'Cone', hsi: 'HSI', vsi: 'VSI' };
/** The unit the crusher's setting is measured in (VSI = rotor speed, others = a size gap). */
export const CRUSHER_SETTING_UNIT: Record<CrusherType, string> = { jaw: 'mm', gyratory: 'mm', cone: 'mm', hsi: 'mm', vsi: 'm/s' };

export interface PlantFeed {
  id: string;
  kind: 'feed';
  name: string;
  tph: number;
  gradation: Gradation;
  bulkDensity: number;
  wet: boolean;
  out: Split;
}

export interface PlantScreen {
  id: string;
  kind: 'screen';
  name: string;
  /** When not false, the name auto-follows the deck sizes. */
  auto?: boolean;
  width: number;
  length: number;
  travelRate: number;
  targetEfficiency: number;
  decks: Deck[];
  /** Where each deck's oversize goes (parallel to decks). */
  deckTargets: Split[];
  /** Where the undersize goes. */
  underTarget: Split;
}

export interface PlantCrusher {
  id: string;
  kind: 'crusher';
  name: string;
  /** When not false, the name auto-follows the CSS. */
  auto?: boolean;
  /** Machine type — defaults to cone for older saved plants. */
  crusherType?: CrusherType;
  /** The machine's setting in mm (CSS for jaw/cone, OSS for gyratory, apron for HSI). */
  css: number;
  capacity: number;
  out: Split;
}

/** An explicit product stockpile — a routable sink. Several outputs can be
 *  wired into the same pile so their material combines in it. */
export interface PlantPile {
  id: string;
  kind: 'pile';
  name: string;
}

export type PlantUnit = PlantFeed | PlantScreen | PlantCrusher | PlantPile;

export interface Plant {
  units: PlantUnit[];
  realistic: boolean;
  /** Flowsheet node positions, keyed by unit id or `pile:<productKey>`.
   *  Missing entries fall back to auto-layout. */
  layout?: Record<string, { x: number; y: number }>;
}

export const PLANT_KEY = 'ass-plant3';

/** A fresh plant: just a feed feeding a product pile. */
export function defaultPlant(): Plant {
  return {
    realistic: true,
    units: [{ id: 'feed', kind: 'feed', name: 'Feed', tph: 300, gradation: FEED_PRESETS[0].gradation, bulkDensity: 100, wet: false, out: one(PILE) }],
  };
}

/** A worked example: a closed-circuit crushing plant feeding a double-deck sizing
 *  screen with three product stockpiles — so a first-time visitor sees the tool's
 *  full range (recycle loop, multiple screens, combined products) at a glance. */
export function examplePlant(): Plant {
  // A coarse quarry-run feed so the primary crusher carries a real load.
  const g: Gradation = [
    { size: 120, percentPassing: 100 }, { size: 75, percentPassing: 82 }, { size: 50, percentPassing: 63 },
    { size: 25, percentPassing: 41 }, { size: 12.5, percentPassing: 26 }, { size: 4.75, percentPassing: 14 },
    { size: 0.6, percentPassing: 5 }, { size: 0.075, percentPassing: 1 },
  ];
  return {
    realistic: true,
    units: [
      { id: 'feed', kind: 'feed', name: 'Pit feed', tph: 500, gradation: g, bulkDensity: 100, wet: false, out: one('scalp') },
      { id: 'scalp', kind: 'screen', name: 'Scalping screen', auto: false, width: 8, length: 20, travelRate: 82, targetEfficiency: 90,
        decks: [{ aperture: 50, openAreaPct: 68, openingShape: 'square' }], deckTargets: [one('jaw')], underTarget: one('sizer') },
      { id: 'jaw', kind: 'crusher', name: 'Jaw crusher', auto: false, crusherType: 'jaw', css: 25, capacity: 400, out: one('scalp') },
      { id: 'sizer', kind: 'screen', name: 'Sizing screen', auto: false, width: 8, length: 24, travelRate: 75, targetEfficiency: 90,
        decks: [{ aperture: 19, openAreaPct: 61, openingShape: 'square' }, { aperture: 9.5, openAreaPct: 51, openingShape: 'square' }],
        deckTargets: [one('coarse'), one('fine')], underTarget: one('sand') },
      { id: 'coarse', kind: 'pile', name: 'Coarse aggregate' },
      { id: 'fine', kind: 'pile', name: 'Fine aggregate' },
      { id: 'sand', kind: 'pile', name: 'Crusher sand' },
    ],
  };
}

/** Coerce a stored routing value (old single-target string, or a new split) to a Split. */
function toSplit(x: unknown): Split {
  if (typeof x === 'string') return [{ to: x, frac: 1 }];
  if (Array.isArray(x)) {
    const rs = x
      .filter((r): r is Route => !!r && typeof r === 'object' && typeof (r as { to?: unknown }).to === 'string')
      .map((r) => ({ to: (r as Route).to, frac: Number((r as Route).frac) || 0 }));
    return rs.length ? rs : [{ to: PILE, frac: 1 }];
  }
  return [{ to: PILE, frac: 1 }];
}

/** Upgrade a raw/saved plant (any older shape) to the current model. */
export function migratePlant(raw: unknown): Plant {
  const r = raw as { realistic?: boolean; units?: Record<string, unknown>[]; layout?: unknown };
  const units = (r.units ?? []).map((u) => {
    if (u.kind === 'feed') return { ...u, out: toSplit(u.out) } as PlantUnit;
    if (u.kind === 'crusher') return { ...u, out: toSplit(u.out), crusherType: (u.crusherType as CrusherType) ?? 'cone' } as PlantUnit;
    if (u.kind === 'screen') {
      const decks = (u.decks as unknown[]) ?? [];
      const dt = ((u.deckTargets as unknown[]) ?? []).map(toSplit);
      while (dt.length < decks.length) dt.push([{ to: PILE, frac: 1 }]);
      return { ...u, deckTargets: dt, underTarget: toSplit(u.underTarget) } as PlantUnit;
    }
    if (u.kind === 'pile') return { id: u.id, kind: 'pile', name: u.name } as PlantUnit;
    return u as unknown as PlantUnit;
  });
  const layout = r.layout && typeof r.layout === 'object' ? (r.layout as Plant['layout']) : {};
  return normalizeNames({ realistic: r.realistic ?? true, units, layout });
}

export function loadPlant(): Plant {
  try {
    const raw = localStorage.getItem(PLANT_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p?.units) && p.units.some((u: PlantUnit) => u.kind === 'feed')) return migratePlant(p);
    }
  } catch {
    /* ignore */
  }
  return defaultPlant();
}

export function savePlant(plant: Plant): void {
  try {
    localStorage.setItem(PLANT_KEY, JSON.stringify(plant));
  } catch {
    /* ignore */
  }
}

/** The name a unit gets from its size (deck openings for a screen, CSS for a crusher). */
export function autoUnitName(u: PlantUnit): string {
  if (u.kind === 'screen') return u.decks.length ? `Screen ${u.decks.map((d) => sieveLabel(d.aperture)).join('/')}` : 'Screen';
  if (u.kind === 'crusher') { const t = u.crusherType ?? 'cone'; return `${CRUSHER_TYPE_LABEL[t]} ${u.css} ${CRUSHER_SETTING_UNIT[t]}`; }
  return u.name;
}

/** Refresh auto-named units so their name follows their current size. */
export function normalizeNames(plant: Plant): Plant {
  return {
    ...plant,
    units: plant.units.map((u) => ((u.kind === 'screen' || u.kind === 'crusher') && u.auto !== false ? { ...u, name: autoUnitName(u) } : u)),
  };
}

/** Units that can be selected as an output target (everything except `self`). */
export function targetOptions(plant: Plant, selfId: string): { id: Target; label: string }[] {
  const opts = plant.units
    .filter((u) => u.id !== selfId && u.kind !== 'feed')
    .map((u) => ({ id: u.id, label: u.name }));
  return [...opts, { id: PILE, label: 'Product pile' }];
}
