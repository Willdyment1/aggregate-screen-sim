// Saved-systems library. Two tiers:
//  • PRESET_PLANTS — curated, built-in systems that ship with the app, so every
//    visitor sees them. New entries are added here in code and go live on deploy.
//  • A personal library in localStorage — many named plants the user saves in
//    their own browser (private; not visible to other visitors).
import type { Gradation } from './types';
import type { Plant } from './plant';
import { one, examplePlant, migratePlant } from './plant';
import { FEED_PRESETS } from './feedPresets';

export interface PresetPlant {
  id: string;
  name: string;
  description: string;
  build: () => Plant;
}

function feed(name: string): Gradation {
  return (FEED_PRESETS.find((p) => p.name === name) ?? FEED_PRESETS[0]).gradation;
}

/** The Dundas washplant feed sized on a 9.5 mm / #4 double-deck screen. */
function dundasWashplant(): Plant {
  return {
    realistic: true,
    units: [
      { id: 'feed', kind: 'feed', name: 'Dundas washplant feed', tph: 300, gradation: feed('Dundas washplant feed'), bulkDensity: 100, wet: true, out: one('sizer') },
      {
        id: 'sizer', kind: 'screen', name: 'Sizing screen', auto: false, width: 6, length: 16, travelRate: 75, targetEfficiency: 90,
        decks: [
          { aperture: 9.5, openAreaPct: 51, openingShape: 'square' },
          { aperture: 4.75, openAreaPct: 40, openingShape: 'square' },
        ],
        deckTargets: [one('coarse'), one('chips')],
        underTarget: one('sand'),
      },
      { id: 'coarse', kind: 'pile', name: 'Coarse (+9.5)' },
      { id: 'chips', kind: 'pile', name: 'Chips (4.75–9.5)' },
      { id: 'sand', kind: 'pile', name: 'Washed sand (−#4)' },
    ],
  };
}

/** A minimal single-deck screen — a clean starting point to build from. */
function singleDeck(): Plant {
  return {
    realistic: true,
    units: [
      { id: 'feed', kind: 'feed', name: 'Feed', tph: 250, gradation: feed('Medium (0–19 mm)'), bulkDensity: 100, wet: false, out: one('screen') },
      {
        id: 'screen', kind: 'screen', name: 'Sizing screen', auto: false, width: 6, length: 16, travelRate: 75, targetEfficiency: 90,
        decks: [{ aperture: 9.5, openAreaPct: 51, openingShape: 'square' }],
        deckTargets: [one('oversize')],
        underTarget: one('undersize'),
      },
      { id: 'oversize', kind: 'pile', name: 'Oversize (+9.5)' },
      { id: 'undersize', kind: 'pile', name: 'Undersize (−9.5)' },
    ],
  };
}

export const PRESET_PLANTS: PresetPlant[] = [
  {
    id: 'closed-circuit',
    name: 'Closed-circuit crushing plant',
    description: 'A jaw crusher in closed circuit with a scalping screen, feeding a double-deck sizer to three products. Shows recycle loops and combined products.',
    build: examplePlant,
  },
  {
    id: 'dundas-washplant',
    name: 'Dundas washplant — 9.5 / #4 sizing',
    description: 'The Dundas washplant feed sized on a 9.5 mm / #4 double-deck screen into coarse, chips and washed sand.',
    build: dundasWashplant,
  },
  {
    id: 'single-deck',
    name: 'Single sizing screen',
    description: 'A minimal starting point: one feed, one 9.5 mm deck, oversize and undersize piles.',
    build: singleDeck,
  },
];

// --- Personal library (localStorage) ---------------------------------------

export interface SavedPlant {
  id: string;
  name: string;
  savedAt: number;
  plant: Plant;
}

const LIB_KEY = 'ass-library1';

function mkId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function loadLibrary(): SavedPlant[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && typeof e.name === 'string' && e.plant && Array.isArray(e.plant.units))
      .map((e) => ({ id: String(e.id ?? mkId()), name: String(e.name), savedAt: Number(e.savedAt) || 0, plant: migratePlant(e.plant) }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function writeLibrary(list: SavedPlant[]): void {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
  } catch {
    /* ignore (quota / disabled storage) */
  }
}

/** Save the current plant under `name`. Overwrites an existing entry of the same
 *  name (case-insensitive) so re-saving updates in place instead of duplicating. */
export function saveToLibrary(name: string, plant: Plant): SavedPlant[] {
  const list = loadLibrary();
  const trimmed = name.trim() || 'Untitled plant';
  const existing = list.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    existing.plant = plant;
    existing.savedAt = Date.now();
    existing.name = trimmed;
  } else {
    list.push({ id: mkId(), name: trimmed, savedAt: Date.now(), plant });
  }
  const sorted = [...list].sort((a, b) => b.savedAt - a.savedAt);
  writeLibrary(sorted);
  return sorted;
}

export function deleteFromLibrary(id: string): SavedPlant[] {
  const list = loadLibrary().filter((e) => e.id !== id);
  writeLibrary(list);
  return list;
}

export function renameInLibrary(id: string, name: string): SavedPlant[] {
  const list = loadLibrary().map((e) => (e.id === id ? { ...e, name: name.trim() || e.name } : e));
  writeLibrary(list);
  return list;
}
