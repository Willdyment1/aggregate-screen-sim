import type { Gradation } from './types';

/** Common feed materials (size distributions) — a quick way to change feed size. */
export interface FeedPreset {
  name: string;
  gradation: Gradation;
}

export const FEED_PRESETS: FeedPreset[] = [
  {
    name: 'Dundas washplant feed',
    gradation: [
      { size: 26.5, percentPassing: 100 },
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
  {
    // 4" (101.6 mm) down to fines — a coarse pit-run / shot-rock feed.
    name: 'Extra coarse (0–101.6 mm)',
    gradation: [
      { size: 101.6, percentPassing: 100 },
      { size: 76.2, percentPassing: 88 },
      { size: 50.8, percentPassing: 70 },
      { size: 37.5, percentPassing: 58 },
      { size: 25.4, percentPassing: 44 },
      { size: 19.0, percentPassing: 36 },
      { size: 9.5, percentPassing: 24 },
      { size: 4.75, percentPassing: 16 },
      { size: 2.36, percentPassing: 10 },
      { size: 0.6, percentPassing: 5 },
      { size: 0.075, percentPassing: 2 },
    ],
  },
  {
    name: 'Coarse (0–37.5 mm)',
    gradation: [
      { size: 37.5, percentPassing: 100 },
      { size: 26.5, percentPassing: 85 },
      { size: 19.0, percentPassing: 68 },
      { size: 13.2, percentPassing: 52 },
      { size: 9.5, percentPassing: 42 },
      { size: 4.75, percentPassing: 28 },
      { size: 2.36, percentPassing: 19 },
      { size: 1.18, percentPassing: 13 },
      { size: 0.6, percentPassing: 9 },
      { size: 0.3, percentPassing: 6 },
      { size: 0.15, percentPassing: 4 },
      { size: 0.075, percentPassing: 2.5 },
    ],
  },
  {
    name: 'Medium (0–19 mm)',
    gradation: [
      { size: 19.0, percentPassing: 100 },
      { size: 13.2, percentPassing: 82 },
      { size: 9.5, percentPassing: 66 },
      { size: 4.75, percentPassing: 45 },
      { size: 2.36, percentPassing: 31 },
      { size: 1.18, percentPassing: 21 },
      { size: 0.6, percentPassing: 14 },
      { size: 0.3, percentPassing: 9 },
      { size: 0.15, percentPassing: 6 },
      { size: 0.075, percentPassing: 4 },
    ],
  },
  {
    name: 'Fine (0–9.5 mm)',
    gradation: [
      { size: 9.5, percentPassing: 100 },
      { size: 4.75, percentPassing: 68 },
      { size: 2.36, percentPassing: 46 },
      { size: 1.18, percentPassing: 31 },
      { size: 0.6, percentPassing: 20 },
      { size: 0.3, percentPassing: 13 },
      { size: 0.15, percentPassing: 8 },
      { size: 0.075, percentPassing: 5 },
    ],
  },
];

/** Name of the preset matching this gradation, or 'Custom'. */
export function matchPreset(g: Gradation): string {
  const key = (x: Gradation) => JSON.stringify(x.map((p) => [p.size, p.percentPassing]));
  const k = key(g);
  return FEED_PRESETS.find((p) => key(p.gradation) === k)?.name ?? 'Custom';
}
