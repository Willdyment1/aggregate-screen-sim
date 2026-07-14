// Screen-size recommender: the smallest standard screen that is adequate on
// every deck (required area covered) AND within the bed-depth limit.
import type { Project } from '../model/types';
import { simulate } from './simulate';

export interface ScreenSize {
  width: number; // ft
  length: number; // ft
}

/** Common North-American vibrating-screen sizes (ft x ft). */
export const STANDARD_SCREENS: ScreenSize[] = [
  { width: 4, length: 10 },
  { width: 4, length: 12 },
  { width: 4, length: 14 },
  { width: 4, length: 16 },
  { width: 5, length: 12 },
  { width: 5, length: 14 },
  { width: 5, length: 16 },
  { width: 5, length: 18 },
  { width: 5, length: 20 },
  { width: 6, length: 16 },
  { width: 6, length: 18 },
  { width: 6, length: 20 },
  { width: 6, length: 24 },
  { width: 7, length: 20 },
  { width: 7, length: 24 },
  { width: 8, length: 20 },
  { width: 8, length: 24 },
];

export interface Recommendation {
  /** Smallest adequate screen, or null if none in the catalog fits. */
  screen: ScreenSize | null;
  area: number; // ft^2 of the pick (0 if none)
  /** Largest required area across decks (the binding constraint), ft^2. */
  maxRequiredArea: number;
  /** 1-indexed deck driving the requirement. */
  bindingDeck: number;
  /** Largest screen in the catalog (shown when nothing fits). */
  largest: ScreenSize;
}

export function recommendScreen(project: Project): Recommendation {
  const base = simulate(project);
  let maxReq = 0;
  let bindingDeck = 1;
  base.decks.forEach((d, i) => {
    if (Number.isFinite(d.requiredArea) && d.requiredArea > maxReq) {
      maxReq = d.requiredArea;
      bindingDeck = i + 1;
    }
  });

  const sorted = [...STANDARD_SCREENS].sort((a, b) => a.width * a.length - b.width * b.length);
  let pick: ScreenSize | null = null;
  for (const s of sorted) {
    const r = simulate({
      ...project,
      screen: { ...project.screen, width: s.width, length: s.length },
    });
    if (r.decks.every((d) => d.adequate && d.bedDepthOk)) {
      pick = s;
      break;
    }
  }

  return {
    screen: pick,
    area: pick ? pick.width * pick.length : 0,
    maxRequiredArea: maxReq,
    bindingDeck,
    largest: sorted[sorted.length - 1],
  };
}
