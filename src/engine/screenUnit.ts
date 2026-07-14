// A screen as a pure splitter block for the routed plant graph: input stream in,
// per-deck results + one oversize stream per deck + an undersize stream out. No
// internal crusher/recirculation — loops are wired explicitly in the graph and
// converged by the plant solver. Reuses the exact single-unit physics.
import type { Deck, DeckResult, Stream } from '../model/types';
import { computeFactors, requiredArea } from './vsma';
import { idealSplit } from './separation';
import { realisticSplit } from './partition';
import { bedDepth, BED_DEPTH_LIMIT_RATIO } from './bedDepth';
import { percentPassing, percentNearSize } from './gradation';
import { achievedEfficiency } from './screeningEfficiency';

export interface ScreenGeom {
  width: number;
  length: number;
  travelRate: number;
}
export interface ScreenOpts {
  targetEfficiency: number;
  bulkDensity: number;
  wet: boolean;
  realistic: boolean;
}
export interface ScreenUnitResult {
  decks: DeckResult[];
  /** Oversize retained on each deck, in deck order. */
  products: { deckIndex: number; aperture: number; stream: Stream }[];
  undersize: Stream;
  ok: boolean;
}

export function processScreen(input: Stream, decks: Deck[], geom: ScreenGeom, opts: ScreenOpts): ScreenUnitResult {
  const actualArea = geom.width * geom.length;
  const deckResults: DeckResult[] = [];
  const products: ScreenUnitResult['products'] = [];
  let current: Stream = input;

  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    const designEff = deck.efficiency ?? opts.targetEfficiency;
    const factors = computeFactors({
      deck,
      deckNumber: i + 1,
      feedGradation: current.gradation,
      bulkDensity: opts.bulkDensity,
      wet: opts.wet,
      efficiency: designEff,
    });
    const undersizeTph = current.tph * (percentPassing(current.gradation, deck.aperture) / 100);
    const reqArea = requiredArea(undersizeTph, factors);
    const utilization = reqArea > 0 && isFinite(reqArea) ? actualArea / reqArea : Infinity;

    let achievedEff = designEff;
    if (opts.realistic) {
      const idealOver = idealSplit(current.tph, current.gradation, deck.aperture).overflow.tph;
      const estBed = bedDepth(idealOver, geom.travelRate, geom.width, opts.bulkDensity);
      const nearSizeFrac = percentNearSize(current.gradation, deck.aperture) / 100;
      const loading = actualArea > 0 && isFinite(reqArea) ? reqArea / actualArea : 2;
      achievedEff = achievedEfficiency({ designEff, bedDepthMm: estBed, aperture: deck.aperture, nearSizeFrac, loading, wet: opts.wet }).efficiency;
    }

    const split = opts.realistic
      ? realisticSplit(current.tph, current.gradation, deck.aperture, achievedEff)
      : idealSplit(current.tph, current.gradation, deck.aperture);
    const bd = bedDepth(split.overflow.tph, geom.travelRate, geom.width, opts.bulkDensity);

    deckResults.push({
      deckIndex: i,
      aperture: deck.aperture,
      feedTph: current.tph,
      undersizeTph,
      requiredArea: reqArea,
      actualArea,
      utilization,
      adequate: utilization >= 1,
      efficiency: designEff,
      achievedEfficiency: achievedEff,
      bedDepth: bd,
      bedDepthLimit: BED_DEPTH_LIMIT_RATIO * deck.aperture,
      bedDepthOk: bd <= BED_DEPTH_LIMIT_RATIO * deck.aperture,
      factors,
      throughflow: split.throughflow,
      overflow: split.overflow,
      overflowTo: 'product',
    });
    products.push({ deckIndex: i, aperture: deck.aperture, stream: split.overflow });
    current = split.throughflow;
  }

  return { decks: deckResults, products, undersize: current, ok: deckResults.every((d) => d.adequate && d.bedDepthOk) };
}
