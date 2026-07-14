// VSMA 9-factor screen sizing (per the Handbook "Factors for Calculating
// Screen Area").
//
//   Required screening area (ft^2) = U / (A x B x C x D x E x F x G x H x I)
//
// where U = tph of UNDERSIZE (material that should pass the deck opening).
// A is basic capacity (tph/ft^2); B..I are dimensionless multipliers. All
// coefficient values live in tables.ts.
import type { Deck, Gradation, VsmaFactors } from '../model/types';
import { percentOversize, percentHalfSize } from './gradation';
import {
  FACTOR_B_OVERSIZE,
  FACTOR_C_HALFSIZE,
  FACTOR_D_DECK,
  FACTOR_E_WET,
  FACTOR_H_SHAPE,
  FACTOR_I_EFFICIENCY,
  USING_SAMPLE_DATA,
  basicCapacity,
  factorF,
  factorG,
  lookup,
} from './tables';

export { USING_SAMPLE_DATA };

/** Millimetres per inch. Material sizes are mm; VSMA tables are inch-keyed. */
export const MM_PER_IN = 25.4;

export interface DeckContext {
  deck: Deck;
  /** 1-indexed deck number (1 = top deck). */
  deckNumber: number;
  /** Gradation of the material ARRIVING at this deck. */
  feedGradation: Gradation;
  bulkDensity: number;
  wet: boolean;
  /** Objective efficiency for this deck, percent. */
  efficiency: number;
}

/** Compute the full A-I factor set for one deck. */
export function computeFactors(ctx: DeckContext): VsmaFactors {
  const { deck, feedGradation: g } = ctx;
  const ap = deck.aperture; // mm
  const apIn = ap / MM_PER_IN; // inches, for the inch-keyed VSMA tables

  // Oversize/halfsize are ratio-based, so they work in any consistent unit (mm).
  const A = basicCapacity(apIn);
  const B = lookup(FACTOR_B_OVERSIZE, percentOversize(g, ap));
  const C = lookup(FACTOR_C_HALFSIZE, percentHalfSize(g, ap));
  const D = FACTOR_D_DECK[ctx.deckNumber] ?? 0.7;
  const E = ctx.wet ? lookup(FACTOR_E_WET, apIn) : 1.0;
  const F = factorF(ctx.bulkDensity);
  const G = factorG(deck.openAreaPct, apIn);
  const H = FACTOR_H_SHAPE[deck.openingShape] ?? 1.0;
  const I = lookup(FACTOR_I_EFFICIENCY, ctx.efficiency);

  const divisor = A * B * C * D * E * F * G * H * I;

  return {
    A_basicCapacity: A,
    B_oversize: B,
    C_halfSize: C,
    D_deckLocation: D,
    E_wetScreening: E,
    F_materialWeight: F,
    G_openArea: G,
    H_openingShape: H,
    I_efficiency: I,
    divisor,
  };
}

/**
 * Required screening area for a deck, ft^2.
 * @param undersizeTph U -- tph of material passing the deck opening.
 */
export function requiredArea(undersizeTph: number, factors: VsmaFactors): number {
  if (factors.divisor <= 0) return Infinity;
  return undersizeTph / factors.divisor;
}
