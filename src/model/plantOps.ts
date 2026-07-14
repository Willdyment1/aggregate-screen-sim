// Pure plant mutations shared by the Plant tab (cards) and the Flowsheet editor,
// so both edit the one plant identically. Every op returns a fresh, name-normalised
// plant; callers just do `onChange(op(plant, ...))`.
import type { Deck } from './types';
import { PILE, one, normalizeNames, type Plant, type PlantUnit, type PlantFeed, type PlantScreen, type PlantCrusher, type Split, type Target } from './plant';
import { STANDARD_SIEVES } from './sieves';
import { FEED_PRESETS } from './feedPresets';

const uid = () => Math.random().toString(36).slice(2, 8);

export const newFeed = (n: number): PlantFeed => ({
  id: uid(), kind: 'feed', name: n <= 1 ? 'Feed' : `Feed ${n}`, tph: 150,
  gradation: FEED_PRESETS[0].gradation, bulkDensity: 100, wet: false, out: one(PILE),
});

export const newScreen = (n: number): PlantScreen => ({
  id: uid(), kind: 'screen', name: `Screen ${n}`, width: 6, length: 16, travelRate: 75, targetEfficiency: 90,
  decks: [{ aperture: 19, openAreaPct: 61, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE),
});
export const newCrusher = (n: number): PlantCrusher => ({ id: uid(), kind: 'crusher', name: `Crusher ${n}`, crusherType: 'cone', css: 13, capacity: 200, out: one(PILE) });

const isPile = (s: Split) => s.length === 1 && s[0].to === PILE;

export function setUnit(plant: Plant, id: string, patch: Partial<PlantUnit>): Plant {
  return normalizeNames({ ...plant, units: plant.units.map((u) => (u.id === id ? ({ ...u, ...patch } as PlantUnit) : u)) });
}

export function setDeck(plant: Plant, id: string, di: number, patch: Partial<Deck>): Plant {
  return normalizeNames({
    ...plant,
    units: plant.units.map((u) => (u.id === id && u.kind === 'screen' ? { ...u, decks: u.decks.map((d, j) => (j === di ? { ...d, ...patch } : d)) } : u)),
  });
}

export function addDeck(plant: Plant, id: string): Plant {
  return normalizeNames({
    ...plant,
    units: plant.units.map((u) => {
      if (u.id !== id || u.kind !== 'screen' || u.decks.length >= 4) return u;
      const last = u.decks[u.decks.length - 1];
      const finer = STANDARD_SIEVES.filter((s) => s.mm < (last?.aperture ?? 25));
      return {
        ...u,
        decks: [...u.decks, { aperture: (finer[0] ?? STANDARD_SIEVES[STANDARD_SIEVES.length - 1]).mm, openAreaPct: 45, openingShape: 'square' }],
        deckTargets: [...u.deckTargets, one(PILE)],
      };
    }),
  });
}

export function removeDeck(plant: Plant, id: string, di: number): Plant {
  return normalizeNames({
    ...plant,
    units: plant.units.map((u) =>
      u.id === id && u.kind === 'screen' && u.decks.length > 1 ? { ...u, decks: u.decks.filter((_, j) => j !== di), deckTargets: u.deckTargets.filter((_, j) => j !== di) } : u,
    ),
  });
}

/** Add a screen/crusher, auto-wiring the previous unit's primary output to it. */
export function addUnit(plant: Plant, kind: 'screen' | 'crusher', pos?: { x: number; y: number }): { plant: Plant; id: string } {
  const n = plant.units.filter((u) => u.kind === kind).length + 1;
  const nu = kind === 'screen' ? newScreen(n) : newCrusher(n);
  const units = plant.units.map((u, i) => {
    if (i !== plant.units.length - 1) return u;
    if (u.kind === 'feed' && isPile(u.out)) return { ...u, out: one(nu.id) };
    if (u.kind === 'crusher' && isPile(u.out)) return { ...u, out: one(nu.id) };
    if (u.kind === 'screen' && isPile(u.underTarget)) return { ...u, underTarget: one(nu.id) };
    return u;
  });
  const layout = pos ? { ...(plant.layout ?? {}), [nu.id]: pos } : plant.layout;
  return { plant: normalizeNames({ ...plant, units: [...units, nu], layout }), id: nu.id };
}

/** Add another feed, wired into the first screen if there is one. */
export function addFeed(plant: Plant, pos?: { x: number; y: number }): { plant: Plant; id: string } {
  const n = plant.units.filter((u) => u.kind === 'feed').length + 1;
  const nf = newFeed(n);
  const firstScreen = plant.units.find((u) => u.kind === 'screen');
  if (firstScreen) nf.out = one(firstScreen.id);
  const layout = pos ? { ...(plant.layout ?? {}), [nf.id]: pos } : plant.layout;
  return { plant: normalizeNames({ ...plant, units: [...plant.units, nf], layout }), id: nf.id };
}

export function removeUnit(plant: Plant, id: string): Plant {
  const target = plant.units.find((u) => u.id === id);
  // A plant always needs at least one feed.
  if (target?.kind === 'feed' && plant.units.filter((u) => u.kind === 'feed').length <= 1) return plant;
  const repoint = (s: Split): Split => s.map((r) => (r.to === id ? { ...r, to: PILE } : r));
  const layout = { ...(plant.layout ?? {}) };
  delete layout[id];
  return normalizeNames({
    ...plant,
    layout,
    units: plant.units
      .filter((u) => u.id !== id)
      .map((u) => {
        if (u.kind === 'feed') return { ...u, out: repoint(u.out) };
        if (u.kind === 'crusher') return { ...u, out: repoint(u.out) };
        return { ...u, underTarget: repoint(u.underTarget), deckTargets: u.deckTargets.map(repoint) };
      }),
  });
}

export function setLayout(plant: Plant, key: string, pos: { x: number; y: number }): Plant {
  return { ...plant, layout: { ...(plant.layout ?? {}), [key]: pos } };
}

export function clearLayout(plant: Plant): Plant {
  return { ...plant, layout: {} };
}

// --- routing ports (used by the flowsheet's drag-to-connect) -----------------

/** Output port ids for a unit: 'out' | 'under' | `deck:<i>`. */
export function portsOf(u: PlantUnit): string[] {
  if (u.kind === 'feed' || u.kind === 'crusher') return ['out'];
  return [...u.decks.map((_, i) => `deck:${i}`), 'under'];
}

const getPort = (u: PlantUnit, port: string): Split => {
  if (u.kind === 'feed' || u.kind === 'crusher') return u.out;
  if (port === 'under') return u.underTarget;
  const i = Number(port.split(':')[1]);
  return u.deckTargets[i] ?? one(PILE);
};

const withPort = (u: PlantUnit, port: string, routes: Split): PlantUnit => {
  if (u.kind === 'feed' || u.kind === 'crusher') return { ...u, out: routes };
  if (port === 'under') return { ...u, underTarget: routes };
  const i = Number(port.split(':')[1]);
  return { ...u, deckTargets: u.deckTargets.map((x, j) => (j === i ? routes : x)) };
};

const setPort = (plant: Plant, unitId: string, port: string, routes: Split): Plant =>
  normalizeNames({ ...plant, units: plant.units.map((u) => (u.id === unitId ? withPort(u, port, routes) : u)) });

/** Wire a unit's output port to a target. Replaces a default (single→pile) route;
 *  otherwise adds the target and evens the split. No-op if already connected. */
export function connect(plant: Plant, unitId: string, port: string, target: Target): Plant {
  const u = plant.units.find((x) => x.id === unitId);
  if (!u || unitId === target) return plant;
  const routes = getPort(u, port);
  if (routes.some((r) => r.to === target)) return plant;
  const next: Split = isPile(routes) && target !== PILE ? one(target) : [...routes, { to: target, frac: 0 }].map((r, _, a) => ({ ...r, frac: 1 / a.length }));
  return setPort(plant, unitId, port, next);
}

/** Remove a target from an output port; renormalise (falls back to a pile). */
export function disconnect(plant: Plant, unitId: string, port: string, target: Target): Plant {
  const u = plant.units.find((x) => x.id === unitId);
  if (!u) return plant;
  const kept = getPort(u, port).filter((r) => r.to !== target);
  if (!kept.length) return setPort(plant, unitId, port, one(PILE));
  const s = kept.reduce((a, r) => a + r.frac, 0);
  return setPort(plant, unitId, port, kept.map((r) => ({ ...r, frac: s > 0 ? r.frac / s : 1 / kept.length })));
}
