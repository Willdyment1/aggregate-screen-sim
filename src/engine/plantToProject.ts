// Bridge the multi-unit plant to the single-screen Project the homepage's
// ResultsPanel understands: use the feed + the first screen, and treat it as a
// closed circuit when that screen's top deck is wired to a crusher that returns
// to the same screen. Exact for a single screen (open, or top-deck closed
// circuit); an approximation for bigger plants (shows the main screen — the
// full circuit lives on the Plant tab).
import type { Plant, PlantScreen, Split } from '../model/plant';
import { PILE, one, normalizeNames } from '../model/plant';
import type { Project } from '../model/types';
import { defaultProject } from '../defaults';

export function plantToProject(plant: Plant): Project {
  const feed = plant.units.find((u) => u.kind === 'feed');
  const screen = plant.units.find((u) => u.kind === 'screen');
  if (!feed) return defaultProject;

  const feedCfg = { tph: feed.tph, gradation: feed.gradation, bulkDensity: feed.bulkDensity, wet: feed.wet };
  if (!screen) {
    return { ...defaultProject, name: 'Add a screen on the Plant tab', feed: feedCfg, realisticScreening: plant.realistic };
  }

  let closedCircuit = false;
  let css = defaultProject.crusher.css;
  let maxTph = defaultProject.crusher.maxTph ?? 200;
  const topRoutes = screen.deckTargets[0] ?? [];
  const crusher = plant.units.find((u) => u.kind === 'crusher' && topRoutes.some((r) => r.to === u.id));
  if (crusher && crusher.kind === 'crusher' && crusher.out.some((r) => r.to === screen.id)) {
    closedCircuit = true;
    css = crusher.css;
    maxTph = crusher.capacity;
  }

  return {
    name: screen.name,
    feed: feedCfg,
    screen: { width: screen.width, length: screen.length, travelRate: screen.travelRate, decks: screen.decks },
    targetEfficiency: screen.targetEfficiency,
    closedCircuit,
    crusher: { css, maxTph },
    realisticScreening: plant.realistic,
    extras: { nodes: [], edges: [] },
  };
}

/**
 * Write a single-screen Project (from the Design tab) back into the plant: update
 * the feed basics and the plant's first screen (geometry + decks). If the plant
 * has no screen yet, create one fed by the feed, all decks to product piles.
 * Wiring (crushers, closed circuit, branching) is left to the Plant tab.
 */
export function applyProjectToPlant(plant: Plant, project: Project): Plant {
  const f = project.feed;
  let units = plant.units.map((u) =>
    u.kind === 'feed' ? { ...u, tph: f.tph, gradation: f.gradation, bulkDensity: f.bulkDensity, wet: f.wet } : u,
  );

  const decks = project.screen.decks;
  const screenIdx = units.findIndex((u) => u.kind === 'screen');
  if (screenIdx >= 0) {
    units = units.map((u, i) =>
      i === screenIdx && u.kind === 'screen'
        ? {
            ...u,
            width: project.screen.width,
            length: project.screen.length,
            travelRate: project.screen.travelRate,
            targetEfficiency: project.targetEfficiency,
            decks,
            // Keep any existing routing that still has a deck; new decks go to a pile.
            deckTargets: decks.map((_, di) => (u.deckTargets[di] as Split) ?? one(PILE)),
          }
        : u,
    );
  } else {
    const screen: PlantScreen = {
      id: 's1',
      kind: 'screen',
      auto: true,
      name: '',
      width: project.screen.width,
      length: project.screen.length,
      travelRate: project.screen.travelRate,
      targetEfficiency: project.targetEfficiency,
      decks,
      deckTargets: decks.map(() => one(PILE)),
      underTarget: one(PILE),
    };
    units = units.map((u) => (u.kind === 'feed' ? { ...u, out: one(screen.id) } : u));
    units = [...units, screen];
  }

  return normalizeNames({ ...plant, units, realistic: project.realisticScreening ?? plant.realistic });
}
