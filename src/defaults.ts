import type { Project } from './model/types';

/**
 * Default project = Lafarge "Dundas Washplant Feed" (sieve analysis from the
 * compliance report), on a closed circuit: top-deck oversize returns to the
 * crusher. Sizes in mm. Feed rate/screen size are editable placeholders.
 */
export const defaultProject: Project = {
  name: 'Dundas Washplant Feed',
  feed: {
    tph: 300,
    bulkDensity: 100,
    wet: false, // report: "Dry Screened"
    gradation: [
      { size: 26.5, percentPassing: 100.0 },
      { size: 19.0, percentPassing: 90.6 },
      { size: 13.2, percentPassing: 64.4 },
      { size: 9.5, percentPassing: 48.7 },
      { size: 4.75, percentPassing: 28.0 },
      { size: 2.36, percentPassing: 18.4 },
      { size: 1.18, percentPassing: 12.7 },
      { size: 0.6, percentPassing: 9.0 },
      { size: 0.3, percentPassing: 6.8 },
      { size: 0.15, percentPassing: 5.3 },
      { size: 0.075, percentPassing: 3.99 },
    ],
  },
  screen: {
    width: 6,
    length: 20,
    travelRate: 75,
    decks: [
      { aperture: 19.0, openAreaPct: 61, openingShape: 'square' }, // top -> crusher return
      { aperture: 9.5, openAreaPct: 51, openingShape: 'square' },
      { aperture: 4.75, openAreaPct: 45, openingShape: 'square' },
    ],
  },
  targetEfficiency: 90,
  closedCircuit: true,
  crusher: { css: 13, maxTph: 200, model: 'HP 300' }, // Metso HP cone: ~2:1 reduction on the 26.5 mm feed, 200 tph rated
  realisticScreening: true,
  extras: { nodes: [], edges: [] },
};
