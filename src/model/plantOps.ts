// Pure plant mutations shared by the Plant tab (cards) and the Flowsheet editor,
// so both edit the one plant identically. Every op returns a fresh, name-normalised
// plant; callers just do `onChange(op(plant, ...))`.
import type { Deck } from './types';
import { PILE, MERGE, one, normalizeNames, type Plant, type PlantUnit, type PlantFeed, type PlantScreen, type PlantCrusher, type Split, type Target } from './plant';
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
/** A port set to fold into a sibling output (see MERGE). */
export const isMergeSplit = (s?: Split): boolean => !!s && s.length === 1 && s[0].to === MERGE;

/** The sibling port a screen's MERGE'd outputs fold into: the finest output that
 *  still goes somewhere — the undersize if it's routed, else the finest deck
 *  oversize. `null` if nothing is left to absorb them. Single source of truth for
 *  both the engine (blends the stream) and the flowsheet (draws the fold). */
export function mergeSinkPort(u: PlantScreen): string | null {
  const ranked = [
    ...u.decks.map((d, i) => ({ port: `deck:${i}`, routes: u.deckTargets[i] ?? one(PILE), rank: d.aperture })),
    { port: 'under', routes: u.underTarget, rank: -1 },
  ];
  const sinks = ranked.filter((r) => !isMergeSplit(r.routes) && r.routes.length > 0);
  if (!sinks.length) return null;
  return sinks.reduce((a, b) => (b.rank < a.rank ? b : a)).port;
}

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

/** Add a screen/crusher as a standalone unit — nothing is wired to it, so the
 *  user connects it themselves (drag on the flowsheet, or the card's routing). */
export function addUnit(plant: Plant, kind: 'screen' | 'crusher', pos?: { x: number; y: number }): { plant: Plant; id: string } {
  const n = plant.units.filter((u) => u.kind === kind).length + 1;
  const nu = kind === 'screen' ? newScreen(n) : newCrusher(n);
  const layout = pos ? { ...(plant.layout ?? {}), [nu.id]: pos } : plant.layout;
  return { plant: normalizeNames({ ...plant, units: [...plant.units, nu], layout }), id: nu.id };
}

/** Add another feed as a standalone unit — not wired to anything by default. */
export function addFeed(plant: Plant, pos?: { x: number; y: number }): { plant: Plant; id: string } {
  const n = plant.units.filter((u) => u.kind === 'feed').length + 1;
  const nf = newFeed(n);
  const layout = pos ? { ...(plant.layout ?? {}), [nf.id]: pos } : plant.layout;
  return { plant: normalizeNames({ ...plant, units: [...plant.units, nf], layout }), id: nf.id };
}

/** Duplicate a unit: a copy with a new id, its outputs reset to a product pile,
 *  named "<name> copy", inserted right after the original (offset on the flowsheet). */
export function duplicateUnit(plant: Plant, id: string): { plant: Plant; id: string } {
  const u = plant.units.find((x) => x.id === id);
  if (!u) return { plant, id };
  const newId = uid();
  const name = `${u.name} copy`;
  let copy: PlantUnit;
  if (u.kind === 'feed') copy = { ...u, id: newId, name, out: one(PILE) };
  else if (u.kind === 'screen') copy = { ...u, id: newId, name, auto: false, decks: u.decks.map((d) => ({ ...d })), deckTargets: u.decks.map(() => one(PILE)), underTarget: one(PILE) };
  else copy = { ...u, id: newId, name, auto: false, out: one(PILE) };

  const layout = { ...(plant.layout ?? {}) };
  if (layout[id]) layout[newId] = { x: layout[id].x + 40, y: layout[id].y + 40 };

  const idx = plant.units.findIndex((x) => x.id === id);
  const units = [...plant.units.slice(0, idx + 1), copy, ...plant.units.slice(idx + 1)];
  return { plant: normalizeNames({ ...plant, units, layout }), id: newId };
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
  // A capped ([]) or folded (MERGE) port has no real routes — reconnecting
  // replaces the sentinel outright rather than splitting against it.
  const raw = getPort(u, port);
  const routes = isMergeSplit(raw) ? [] : raw;
  if (routes.some((r) => r.to === target)) return plant;
  const next: Split =
    routes.length === 0 ? one(target)
    : isPile(routes) && target !== PILE ? one(target)
    : [...routes, { to: target, frac: 0 }].map((r, _, a) => ({ ...r, frac: 1 / a.length }));
  return setPort(plant, unitId, port, next);
}

/** Remove a target from an output port; renormalise the rest. Removing the last
 *  route on a port that had a split hands its share to the remaining branch. When
 *  a port loses its *only* route, its stream would otherwise vanish — so if the
 *  unit has another output that still goes somewhere, we fold this stream into it
 *  (MERGE) to conserve tonnage; a single-output unit (feed/crusher) caps instead.
 *  Re-dragging the port to another box or empty space restores a normal route. */
export function disconnect(plant: Plant, unitId: string, port: string, target: Target): Plant {
  const u = plant.units.find((x) => x.id === unitId);
  if (!u) return plant;
  // Deleting the fold itself caps the port (drops the stream) — otherwise it
  // would immediately re-fold and look undeletable.
  if (target === MERGE) return setPort(plant, unitId, port, []);
  const kept = getPort(u, port).filter((r) => r.to !== target);
  if (!kept.length) {
    const hasSink = portsOf(u).some((p) => p !== port && getPort(u, p).length > 0 && !isMergeSplit(getPort(u, p)));
    return setPort(plant, unitId, port, hasSink ? [{ to: MERGE, frac: 1 }] : []);
  }
  const s = kept.reduce((a, r) => a + r.frac, 0);
  return setPort(plant, unitId, port, kept.map((r) => ({ ...r, frac: s > 0 ? r.frac / s : 1 / kept.length })));
}
