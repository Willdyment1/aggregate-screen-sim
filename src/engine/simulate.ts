// Top-level orchestration: size + simulate a 1..4 deck screen using the VSMA
// 9-factor method, optionally on a closed circuit where the top deck's oversize
// is crushed and recirculated into the feed.
import type { Project, SimulationResult, DeckResult, Stream, Gradation } from '../model/types';
import { computeFactors, requiredArea } from './vsma';
import { idealSplit, type Split } from './separation';
import { realisticSplit } from './partition';
import { bedDepth, BED_DEPTH_LIMIT_RATIO } from './bedDepth';
import { crusherProduct } from './crusher';
import { blendGradations, percentPassing, percentNearSize } from './gradation';
import { achievedEfficiency } from './screeningEfficiency';

export function simulate(project: Project): SimulationResult {
  const { feed, screen, targetEfficiency, closedCircuit, crusher, realisticScreening } = project;
  const actualArea = screen.width * screen.length;
  const decks = screen.decks;
  const fresh = feed.tph;

  // Product split: ideal cut (Handbook) or non-ideal partition curve.
  const doSplit = (tph: number, grad: Gradation, ap: number, eff: number): Split =>
    realisticScreening ? realisticSplit(tph, grad, ap, eff) : idealSplit(tph, grad, ap);
  const effOf = (i: number) => decks[i]?.efficiency ?? targetEfficiency;

  // 1. Resolve the feed reaching the TOP deck (steady state if closed circuit).
  let topFeed: Stream = { tph: fresh, gradation: feed.gradation };
  let recirc = 0;
  let crusherOut: Stream | undefined;
  const useCircuit = closedCircuit && decks.length > 0;

  if (useCircuit) {
    const topAperture = decks[0].aperture;
    const topEff = effOf(0);
    // Crusher product tops out at its closed-side setting (CSS). If CSS is
    // coarser than the top-deck opening, part of the crushed product is still
    // oversize and recirculates again -> circulating load builds up.
    const css = Math.max(0.1, crusher.css || 25);
    // The crusher feed is the top-deck oversize; approximate its size/top by the
    // fresh-feed oversize (its top size is the biggest rock in the circuit).
    const crusherFeedGrad = idealSplit(fresh, feed.gradation, topAperture).overflow.gradation;
    const crushed = crusherProduct(css, crusherFeedGrad);
    const cap = fresh * 100; // guard runaway (an unstable circuit) from going to Infinity
    // Fixed-point on the recirculating load R: R = oversize carried by the top
    // deck, which itself depends on the blended (fresh + crushed) feed.
    for (let iter = 0; iter < 1000; iter++) {
      const grad = blendGradations([
        { tph: fresh, gradation: feed.gradation },
        { tph: recirc, gradation: crushed },
      ]);
      const total = fresh + recirc;
      let next = doSplit(total, grad, topAperture, topEff).overflow.tph;
      if (!Number.isFinite(next)) break;
      next = Math.min(next, cap);
      topFeed = { tph: total, gradation: grad };
      if (Math.abs(next - recirc) < 1e-3) {
        recirc = next;
        break;
      }
      recirc = next;
    }
    // What actually comes out of the crusher (mass = recirculating load).
    crusherOut = { tph: recirc, gradation: crushed };
  }

  // 2. Run the decks top-to-bottom.
  const deckResults: DeckResult[] = [];
  let current: Stream = topFeed;
  let crusherReturn: Stream | undefined;

  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    // Design (objective) efficiency — used for VSMA sizing (Factor I).
    const designEff = deck.efficiency ?? targetEfficiency;

    const factors = computeFactors({
      deck,
      deckNumber: i + 1,
      feedGradation: current.gradation,
      bulkDensity: feed.bulkDensity,
      wet: feed.wet,
      efficiency: designEff,
    });

    // VSMA sizing uses the IDEAL undersize U (the amount that should pass),
    // independent of the screening model.
    const undersizeTph = current.tph * (percentPassing(current.gradation, deck.aperture) / 100);
    const reqArea = requiredArea(undersizeTph, factors);
    const utilization = reqArea > 0 && isFinite(reqArea) ? actualArea / reqArea : Infinity;

    const overflowTo: 'product' | 'crusher' = useCircuit && i === 0 ? 'crusher' : 'product';

    // Achieved efficiency: how well this deck actually separates, given bed
    // depth, near-size and loading. Applied to product decks in realistic mode;
    // the closed-circuit top deck keeps the design value so its oversize matches
    // the recirculation solve. Estimate bed depth from the ideal oversize first
    // (the real split needs the efficiency we're about to compute).
    let achievedEff = designEff;
    if (realisticScreening && overflowTo === 'product') {
      const idealOver = idealSplit(current.tph, current.gradation, deck.aperture).overflow.tph;
      const estBed = bedDepth(idealOver, screen.travelRate, screen.width, feed.bulkDensity);
      const nearSizeFrac = percentNearSize(current.gradation, deck.aperture) / 100;
      const loading = actualArea > 0 && isFinite(reqArea) ? reqArea / actualArea : 2;
      achievedEff = achievedEfficiency({
        designEff,
        bedDepthMm: estBed,
        aperture: deck.aperture,
        nearSizeFrac,
        loading,
        wet: feed.wet,
      }).efficiency;
    }

    // Product streams follow the selected model (ideal, or the realistic
    // partition at the achieved efficiency).
    const split = doSplit(current.tph, current.gradation, deck.aperture, achievedEff);

    if (overflowTo === 'crusher') crusherReturn = split.overflow;

    const bd = bedDepth(split.overflow.tph, screen.travelRate, screen.width, feed.bulkDensity);
    const bdLimit = BED_DEPTH_LIMIT_RATIO * deck.aperture;

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
      bedDepthLimit: bdLimit,
      bedDepthOk: bd <= bdLimit,
      factors,
      throughflow: split.throughflow,
      overflow: split.overflow,
      overflowTo,
    });

    current = split.throughflow;
  }

  return {
    decks: deckResults,
    finalUndersize: current,
    closedCircuit: useCircuit,
    freshFeedTph: fresh,
    recirculationTph: recirc,
    totalTopFeedTph: topFeed.tph,
    circulatingLoadPct: fresh > 0 ? (recirc / fresh) * 100 : 0,
    crusherReturn,
    crusherOut,
  };
}
