import { describe, it, expect } from 'vitest';
import { percentPassing, percentOversize, percentHalfSize, sizeAtPassing } from './gradation';
import { computeFactors, requiredArea, MM_PER_IN } from './vsma';
import { idealSplit } from './separation';
import { simulate } from './simulate';
import { recommendScreen, STANDARD_SCREENS } from './recommend';
import { findMaxFeed, sweepMaxFeed } from './maxFeed';
import { achievedEfficiency, EFF_FLOOR } from './screeningEfficiency';
import { realisticSplit, partitionToOversize } from './partition';
import { bedDepth } from './bedDepth';
import { simulatePlant } from './plant';
import { plantMaxFeed } from './plantMaxFeed';
import { PILE, one, type Plant } from '../model/plant';
import { parseSize } from '../ui/SieveSelect';
import { plantToProject } from './plantToProject';
import { CRUSHER_SETTINGS, crusherProduct } from './crusher';
import { defaultProject } from '../defaults';
import type { Gradation, Project } from '../model/types';

const inMm = (inches: number) => inches * MM_PER_IN;

// ---------------------------------------------------------------------------
// The VSMA Handbook worked example (open circuit), now expressed in mm since the
// app is metric. Sizes are the inch values x 25.4; results must be unchanged:
// 48 / 93 / 111 ft^2 and 45 / 75 / 90 / 90 tph.
// ---------------------------------------------------------------------------
const handbookFeed: Gradation = [
  { size: inMm(2.0), percentPassing: 100 },
  { size: inMm(1.25), percentPassing: 91 },
  { size: inMm(1.0), percentPassing: 85 },
  { size: inMm(0.75), percentPassing: 70 },
  { size: inMm(0.5), percentPassing: 60 },
  { size: inMm(0.375), percentPassing: 45 },
  { size: inMm(0.25), percentPassing: 30 },
  { size: inMm(0.1875), percentPassing: 22 },
  { size: inMm(0.125), percentPassing: 15 },
  { size: inMm(0.079), percentPassing: 6 },
];

const handbookProject: Project = {
  name: 'VSMA worked example',
  feed: { tph: 300, bulkDensity: 100, wet: false, gradation: handbookFeed },
  screen: {
    width: 6,
    length: 20,
    travelRate: 75,
    decks: [
      { aperture: inMm(1.0), openAreaPct: 64, openingShape: 'square', efficiency: 95 },
      { aperture: inMm(0.5), openAreaPct: 54, openingShape: 'square', efficiency: 95 },
      { aperture: inMm(0.25), openAreaPct: 46, openingShape: 'square', efficiency: 90 },
    ],
  },
  targetEfficiency: 90,
  closedCircuit: false,
  crusher: { css: 25 },
  realisticScreening: false,
  extras: { nodes: [], edges: [] },
};

describe('gradation math (mm)', () => {
  it('returns exact values at sieve points', () => {
    expect(percentPassing(handbookFeed, inMm(1.0))).toBeCloseTo(85, 5);
    expect(percentPassing(handbookFeed, inMm(0.5))).toBeCloseTo(60, 5);
  });
  it('computes oversize and halfsize for Factors B and C', () => {
    expect(percentOversize(handbookFeed, inMm(1.0))).toBeCloseTo(15, 5);
    expect(percentHalfSize(handbookFeed, inMm(1.0))).toBeCloseTo(60, 5);
  });
  it('sizeAtPassing inverts percentPassing (P-values)', () => {
    // At a sieve point the size round-trips.
    expect(sizeAtPassing(handbookFeed, 85)).toBeCloseTo(inMm(1.0), 5);
    expect(sizeAtPassing(handbookFeed, 60)).toBeCloseTo(inMm(0.5), 5);
    // Round-trip through both directions at an interpolated point.
    const s = sizeAtPassing(handbookFeed, 50);
    expect(percentPassing(handbookFeed, s)).toBeCloseTo(50, 4);
    // Out-of-range clamps to the ends.
    expect(sizeAtPassing(handbookFeed, 100)).toBeCloseTo(inMm(2.0), 5);
  });
});

describe('VSMA factors reproduce the Handbook (mm in, inch tables)', () => {
  it('top-deck factors and area match the worked example', () => {
    const f = computeFactors({
      deck: { aperture: inMm(1.0), openAreaPct: 64, openingShape: 'square' },
      deckNumber: 1,
      feedGradation: handbookFeed,
      bulkDensity: 100,
      wet: false,
      efficiency: 95,
    });
    expect(f.A_basicCapacity).toBeCloseTo(3.56, 2);
    expect(f.B_oversize).toBeCloseTo(1.08, 2);
    expect(f.C_halfSize).toBeCloseTo(1.4, 2);
    expect(f.G_openArea).toBeCloseTo(1.0, 2);
    expect(f.I_efficiency).toBeCloseTo(1.0, 2);
    expect(requiredArea(255, f)).toBeCloseTo(47.4, 0);
  });
});

describe('full simulation vs. Handbook (open circuit)', () => {
  const r = simulate(handbookProject);

  it('required areas match 48 / 93 / 111 ft^2', () => {
    expect(r.decks[0].requiredArea).toBeGreaterThan(46);
    expect(r.decks[0].requiredArea).toBeLessThan(49);
    expect(r.decks[1].requiredArea).toBeGreaterThan(91);
    expect(r.decks[1].requiredArea).toBeLessThan(95);
    expect(r.decks[2].requiredArea).toBeGreaterThan(108);
    expect(r.decks[2].requiredArea).toBeLessThan(113);
  });
  it('product tonnages match 45 / 75 / 90 / 90 tph', () => {
    expect(r.decks[0].overflow.tph).toBeCloseTo(45, 0);
    expect(r.decks[1].overflow.tph).toBeCloseTo(75, 0);
    expect(r.decks[2].overflow.tph).toBeCloseTo(90, 0);
    expect(r.finalUndersize.tph).toBeCloseTo(90, 0);
  });
  it('all top-deck oversize is a product when open circuit', () => {
    expect(r.closedCircuit).toBe(false);
    expect(r.decks[0].overflowTo).toBe('product');
    expect(r.recirculationTph).toBe(0);
  });
  it('conserves total mass', () => {
    const total = r.decks.reduce((s, d) => s + d.overflow.tph, 0) + r.finalUndersize.tph;
    expect(total).toBeCloseTo(300, 2);
  });
});

describe('closed circuit (top deck -> crusher)', () => {
  const project: Project = {
    ...handbookProject,
    name: 'closed circuit',
    closedCircuit: true,
    // remove per-deck efficiency overrides so it uses the target
    screen: {
      ...handbookProject.screen,
      decks: handbookProject.screen.decks.map((d) => ({ ...d, efficiency: undefined })),
    },
  };
  const r = simulate(project);

  it('reports a positive recirculating load and larger total top feed', () => {
    expect(r.closedCircuit).toBe(true);
    expect(r.recirculationTph).toBeGreaterThan(0);
    expect(r.totalTopFeedTph).toBeGreaterThan(r.freshFeedTph);
    expect(r.circulatingLoadPct).toBeCloseTo((r.recirculationTph / 300) * 100, 3);
  });

  it('top-deck oversize goes to the crusher, not a product pile', () => {
    expect(r.decks[0].overflowTo).toBe('crusher');
    expect(r.crusherReturn?.tph).toBeCloseTo(r.recirculationTph, 2);
  });

  it('top-deck undersize equals the fresh feed at steady state', () => {
    // Everything fed fresh eventually passes the top deck after crushing.
    expect(r.decks[0].undersizeTph).toBeCloseTo(300, 1);
  });

  it('conserves mass: products + final undersize = fresh feed (recirc is internal)', () => {
    const products = r.decks
      .filter((d) => d.overflowTo === 'product')
      .reduce((s, d) => s + d.overflow.tph, 0);
    expect(products + r.finalUndersize.tph).toBeCloseTo(300, 1);
  });
});

describe('realistic (non-ideal) screening', () => {
  const realistic: Project = { ...handbookProject, realisticScreening: true };
  const ideal = simulate(handbookProject);
  const real = simulate(realistic);

  it('conserves total mass', () => {
    const total = real.decks.reduce((s, d) => s + d.overflow.tph, 0) + real.finalUndersize.tph;
    expect(total).toBeCloseTo(300, 1);
  });

  it('leaves the top-deck required area unchanged (same feed, ideal-U sizing)', () => {
    // Lower decks legitimately differ because their feed (carryover) differs.
    expect(real.decks[0].requiredArea).toBeCloseTo(ideal.decks[0].requiredArea, 3);
  });

  it('puts misplaced (undersize) material into the top-deck oversize product', () => {
    // Ideal cut: essentially nothing finer than the opening in the oversize.
    // Realistic: some undersize is carried over, so %passing(opening) > 0.
    const idealCarry = percentPassing(ideal.decks[0].overflow.gradation, inMm(1.0));
    const realCarry = percentPassing(real.decks[0].overflow.gradation, inMm(1.0));
    expect(realCarry).toBeGreaterThan(idealCarry);
  });

  it('shifts product tonnages relative to the ideal cut', () => {
    expect(real.decks[0].overflow.tph).not.toBeCloseTo(ideal.decks[0].overflow.tph, 1);
  });
});

describe('bed-depth limit flag', () => {
  it('computes a limit of ~4x the opening and flags a too-deep bed', () => {
    // Narrow, slow screen -> deep bed on the top deck.
    const deep: Project = {
      ...handbookProject,
      feed: { ...handbookProject.feed, tph: 1200 },
      screen: { ...handbookProject.screen, width: 4, travelRate: 40 },
    };
    const r = simulate(deep);
    const d0 = r.decks[0];
    expect(d0.bedDepthLimit).toBeCloseTo(4 * d0.aperture, 5);
    expect(d0.bedDepth).toBeGreaterThan(d0.bedDepthLimit);
    expect(d0.bedDepthOk).toBe(false);
  });

  it('a well-sized deck is within the limit', () => {
    const r = simulate(handbookProject);
    expect(r.decks[r.decks.length - 1].bedDepthOk).toBe(true);
  });
});

describe('screen-size recommender', () => {
  it('recommends the smallest catalog screen that covers the max required area', () => {
    const rec = recommendScreen(handbookProject);
    expect(rec.screen).not.toBeNull();
    expect(rec.area).toBeGreaterThanOrEqual(rec.maxRequiredArea);
    // The recommended screen makes every deck adequate.
    const r = simulate({
      ...handbookProject,
      screen: { ...handbookProject.screen, width: rec.screen!.width, length: rec.screen!.length },
    });
    expect(r.decks.every((d) => d.adequate && d.bedDepthOk)).toBe(true);
    // And it is genuinely the smallest such catalog size.
    const smaller = STANDARD_SCREENS.filter((s) => s.width * s.length < rec.area);
    for (const s of smaller) {
      const rr = simulate({
        ...handbookProject,
        screen: { ...handbookProject.screen, width: s.width, length: s.length },
      });
      expect(rr.decks.every((d) => d.adequate && d.bedDepthOk)).toBe(false);
    }
  });
});

describe('ideal separation', () => {
  it('conserves mass and passes nothing coarser than the opening', () => {
    const split = idealSplit(300, handbookFeed, inMm(1.0));
    expect(split.throughflow.tph + split.overflow.tph).toBeCloseTo(300, 5);
    expect(split.throughflow.tph).toBeCloseTo(255, 5);
  });
});

describe('achieved (real) screening efficiency', () => {
  // Favourable baseline: shallow bed (1x), no near-size, light load -> no penalty.
  const base = { designEff: 90, bedDepthMm: 10, aperture: 10, nearSizeFrac: 0, loading: 0.5, wet: false };

  it('never exceeds the design efficiency and never drops below the floor', () => {
    expect(achievedEfficiency(base).efficiency).toBeLessThanOrEqual(90);
    const awful = achievedEfficiency({ designEff: 90, bedDepthMm: 200, aperture: 10, nearSizeFrac: 1, loading: 3, wet: false });
    expect(awful.efficiency).toBeGreaterThanOrEqual(EFF_FLOOR);
  });

  it('good conditions achieve ~the design value', () => {
    // Shallow bed (<3x), little near-size, light load -> no penalty.
    expect(achievedEfficiency(base).efficiency).toBeCloseTo(90, 5);
  });

  it('degrades monotonically with bed depth, near-size and loading', () => {
    const e0 = achievedEfficiency(base).efficiency;
    const deeper = achievedEfficiency({ ...base, bedDepthMm: 60 }).efficiency; // 6x opening
    const nearer = achievedEfficiency({ ...base, nearSizeFrac: 0.6 }).efficiency;
    const heavier = achievedEfficiency({ ...base, loading: 1.2 }).efficiency;
    expect(deeper).toBeLessThan(e0);
    expect(nearer).toBeLessThan(e0);
    expect(heavier).toBeLessThan(e0);
  });

  it('spray water recovers some near-size loss', () => {
    const dry = achievedEfficiency({ ...base, nearSizeFrac: 0.6, wet: false }).efficiency;
    const wet = achievedEfficiency({ ...base, nearSizeFrac: 0.6, wet: true }).efficiency;
    expect(wet).toBeGreaterThan(dry);
  });

  it('simulate: product decks achieve <= design efficiency and still conserve mass', () => {
    const proj: Project = {
      ...handbookProject,
      realisticScreening: true,
      screen: { ...handbookProject.screen, decks: handbookProject.screen.decks.map((d) => ({ ...d, efficiency: undefined })) },
    };
    const r = simulate(proj);
    r.decks.forEach((d) => expect(d.achievedEfficiency).toBeLessThanOrEqual(d.efficiency + 1e-9));
    const out = r.decks.reduce((s, d) => s + d.overflow.tph, 0) + r.finalUndersize.tph;
    expect(out).toBeCloseTo(proj.feed.tph, 1);
  });
});

describe('plant → single-screen project bridge (homepage)', () => {
  const feedGrad: Gradation = [
    { size: 25, percentPassing: 100 },
    { size: 9.5, percentPassing: 50 },
    { size: 0.075, percentPassing: 3 },
  ];
  const mkPlant = (units: Plant['units']): Plant => ({ realistic: false, units });

  it('maps feed + first screen (open circuit)', () => {
    const proj = plantToProject(mkPlant([
      { id: 'f', kind: 'feed', name: 'Feed', tph: 250, gradation: feedGrad, bulkDensity: 100, wet: false, out: one('s') },
      { id: 's', kind: 'screen', name: 'S', width: 6, length: 16, travelRate: 75, targetEfficiency: 88, decks: [{ aperture: 19, openAreaPct: 61, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) },
    ]));
    expect(proj.feed.tph).toBe(250);
    expect(proj.screen.decks[0].aperture).toBe(19);
    expect(proj.targetEfficiency).toBe(88);
    expect(proj.closedCircuit).toBe(false);
  });

  it('detects a top-deck → crusher → back closed circuit', () => {
    const proj = plantToProject(mkPlant([
      { id: 'f', kind: 'feed', name: 'Feed', tph: 300, gradation: feedGrad, bulkDensity: 100, wet: false, out: one('s') },
      { id: 's', kind: 'screen', name: 'S', width: 8, length: 20, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 19, openAreaPct: 61, openingShape: 'square' }], deckTargets: [one('c')], underTarget: one(PILE) },
      { id: 'c', kind: 'crusher', name: 'C', css: 13, capacity: 250, out: one('s') },
    ]));
    expect(proj.closedCircuit).toBe(true);
    expect(proj.crusher.css).toBe(13);
    expect(proj.crusher.maxTph).toBe(250);
  });
});

describe('custom size parsing (mm or inches)', () => {
  it('parses inch fractions to mm', () => {
    expect(parseSize('9/16')).toBeCloseTo(14.29, 1);
    expect(parseSize('1-1/4')).toBeCloseTo(31.75, 2);
    expect(parseSize('3/4"')).toBeCloseTo(19.05, 1);
    expect(parseSize('0.5"')).toBeCloseTo(12.7, 1);
  });
  it('treats a plain number as mm', () => {
    expect(parseSize('14.3')).toBe(14.3);
    expect(parseSize('25')).toBe(25);
    expect(parseSize('20 mm')).toBe(20);
  });
  it('rejects junk', () => {
    expect(parseSize('')).toBeNull();
    expect(parseSize('abc')).toBeNull();
    expect(parseSize('-5')).toBeNull();
  });
});

describe('routed plant graph (branching + recycle loops)', () => {
  const feedGrad: Gradation = [
    { size: 50, percentPassing: 100 },
    { size: 25, percentPassing: 70 },
    { size: 12.5, percentPassing: 45 },
    { size: 4.75, percentPassing: 25 },
    { size: 0.075, percentPassing: 3 },
  ];

  // feed → screen; deck1 oversize → pile, undersize → screen2 (branch)
  const branched: Plant = {
    realistic: false,
    units: [
      { id: 'f', kind: 'feed', name: 'Feed', tph: 300, gradation: feedGrad, bulkDensity: 100, wet: false, out: one('s1') },
      { id: 's1', kind: 'screen', name: 'A', width: 6, length: 16, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 25, openAreaPct: 60, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one('s2') },
      { id: 's2', kind: 'screen', name: 'B', width: 6, length: 16, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 9.5, openAreaPct: 51, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) },
    ],
  };

  it('branches and conserves mass across the graph', () => {
    const r = simulatePlant(branched);
    expect(r.runaway).toBe(false);
    expect(r.nodes).toHaveLength(2);
    const total = r.piles.reduce((s, p) => s + p.stream.tph, 0);
    expect(total).toBeCloseTo(300, 0);
    expect(r.piles).toHaveLength(3); // A +1", B +3/8", B undersize
  });

  it('splits one output across two destinations by fraction (mass conserved)', () => {
    // Deck 1 oversize: 70% to a pile, 30% to a second screen.
    const split: Plant = {
      realistic: false,
      units: [
        { id: 'f', kind: 'feed', name: 'Feed', tph: 300, gradation: feedGrad, bulkDensity: 100, wet: false, out: one('s1') },
        { id: 's1', kind: 'screen', name: 'A', width: 8, length: 20, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 25, openAreaPct: 60, openingShape: 'square' }], deckTargets: [[{ to: PILE, frac: 0.7 }, { to: 's2', frac: 0.3 }]], underTarget: one(PILE) },
        { id: 's2', kind: 'screen', name: 'B', width: 6, length: 16, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 12.5, openAreaPct: 55, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) },
      ],
    };
    const r = simulatePlant(split);
    expect(r.runaway).toBe(false);
    expect(r.piles.reduce((s, p) => s + p.stream.tph, 0)).toBeCloseTo(300, 0); // nothing lost or created

    // Screen B's input is exactly 0.3 of screen A's full deck-1 oversize.
    const openOnly = simulatePlant({ ...split, units: split.units.map((u) => (u.id === 's1' ? { ...u, deckTargets: [one(PILE)] } : u)) });
    const fullOversize = openOnly.piles.find((p) => p.fromUnit === 's1' && p.label.includes('+'))!.stream.tph;
    const bInput = r.nodes.find((n) => n.id === 's2')!.input.tph;
    expect(bInput).toBeCloseTo(fullOversize * 0.3, 1);
  });

  it('unbalanced split percentages are normalised so mass is still conserved', () => {
    // Fractions sum to 1.5 — the solver normalises rather than creating mass.
    const p: Plant = {
      realistic: false,
      units: [
        { id: 'f', kind: 'feed', name: 'Feed', tph: 300, gradation: feedGrad, bulkDensity: 100, wet: false, out: one('s') },
        { id: 's', kind: 'screen', name: 'S', width: 8, length: 20, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 25, openAreaPct: 60, openingShape: 'square' }], deckTargets: [[{ to: PILE, frac: 1 }, { to: PILE, frac: 0.5 }]], underTarget: one(PILE) },
      ],
    };
    expect(simulatePlant(p).piles.reduce((s, x) => s + x.stream.tph, 0)).toBeCloseTo(300, 0);
  });

  it('blends multiple feeds into one system (tonnage sums, mass conserved)', () => {
    const gCoarse: Gradation = [{ size: 50, percentPassing: 100 }, { size: 12.5, percentPassing: 40 }, { size: 0.075, percentPassing: 3 }];
    const gFine: Gradation = [{ size: 25, percentPassing: 100 }, { size: 4.75, percentPassing: 55 }, { size: 0.075, percentPassing: 6 }];
    const p: Plant = {
      realistic: false,
      units: [
        { id: 'f1', kind: 'feed', name: 'Coarse feed', tph: 200, gradation: gCoarse, bulkDensity: 100, wet: false, out: one('s') },
        { id: 'f2', kind: 'feed', name: 'Fine feed', tph: 100, gradation: gFine, bulkDensity: 100, wet: false, out: one('s') },
        { id: 's', kind: 'screen', name: 'S', width: 8, length: 20, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 12.5, openAreaPct: 55, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) },
      ],
    };
    const r = simulatePlant(p);
    expect(r.feedTph).toBeCloseTo(300, 6); // total of both feeds
    const screen = r.nodes.find((n) => n.id === 's')!;
    expect(screen.input.tph).toBeCloseTo(300, 1); // both feeds blended onto the one screen
    expect(r.piles.reduce((s, x) => s + x.stream.tph, 0)).toBeCloseTo(300, 0);
  });

  it('threads per-screen bulk density from the feeds reaching each screen', () => {
    const g: Gradation = [{ size: 50, percentPassing: 100 }, { size: 12.5, percentPassing: 40 }, { size: 0.075, percentPassing: 3 }];
    const mkScreen = (id: string): Plant['units'][number] => ({ id, kind: 'screen', name: id, width: 8, length: 20, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 12.5, openAreaPct: 55, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) });
    // Heavy feed → screen A; light feed → screen B; each should size on its own density.
    const split: Plant = {
      realistic: false,
      units: [
        { id: 'fa', kind: 'feed', name: 'Heavy', tph: 100, gradation: g, bulkDensity: 120, wet: false, out: one('a') },
        { id: 'fb', kind: 'feed', name: 'Light', tph: 100, gradation: g, bulkDensity: 80, wet: false, out: one('b') },
        mkScreen('a'), mkScreen('b'),
      ],
    };
    const r = simulatePlant(split);
    const dens = (id: string) => { const n = r.nodes.find((x) => x.id === id); return n && n.kind === 'screen' ? n.input.density : undefined; };
    expect(dens('a')).toBeCloseTo(120, 3);
    expect(dens('b')).toBeCloseTo(80, 3);

    // Both feeds into one screen → mass-weighted blend (120·100 + 80·100)/200 = 100.
    const merged: Plant = { realistic: false, units: [
      { id: 'fa', kind: 'feed', name: 'Heavy', tph: 100, gradation: g, bulkDensity: 120, wet: false, out: one('s') },
      { id: 'fb', kind: 'feed', name: 'Light', tph: 100, gradation: g, bulkDensity: 80, wet: false, out: one('s') },
      mkScreen('s'),
    ] };
    const rm = simulatePlant(merged);
    const s = rm.nodes.find((x) => x.id === 's');
    expect(s && s.kind === 'screen' ? s.input.density : 0).toBeCloseTo(100, 1);
  });

  it('auto-combines product piles of the same size band', () => {
    // Feed splits to two identical screens; both make a +1/2" and a −1/2" pile →
    // each pair merges into one combined stockpile.
    const p: Plant = {
      realistic: false,
      units: [
        { id: 'f', kind: 'feed', name: 'Feed', tph: 300, gradation: feedGrad, bulkDensity: 100, wet: false, out: [{ to: 'a', frac: 0.5 }, { to: 'b', frac: 0.5 }] },
        { id: 'a', kind: 'screen', name: 'A', width: 6, length: 16, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 12.5, openAreaPct: 55, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) },
        { id: 'b', kind: 'screen', name: 'B', width: 6, length: 16, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 12.5, openAreaPct: 55, openingShape: 'square' }], deckTargets: [one(PILE)], underTarget: one(PILE) },
      ],
    };
    const r = simulatePlant(p);
    expect(r.piles).toHaveLength(2); // one combined +1/2", one combined −1/2"
    expect(r.piles.every((x) => x.label.includes('combined'))).toBe(true);
    expect(r.piles.reduce((s, x) => s + x.stream.tph, 0)).toBeCloseTo(300, 0);
    // Different apertures stay separate.
    const p2 = { ...p, units: p.units.map((u) => (u.id === 'b' && u.kind === 'screen' ? { ...u, decks: [{ aperture: 9.5, openAreaPct: 55, openingShape: 'square' as const }] } : u)) };
    expect(simulatePlant(p2).piles.length).toBeGreaterThan(2);
  });

  // A closed circuit built by WIRING: deck1 oversize → crusher → back to screen.
  const looped: Plant = {
    realistic: false,
    units: [
      { id: 'f', kind: 'feed', name: 'Feed', tph: 300, gradation: feedGrad, bulkDensity: 100, wet: false, out: one('s') },
      { id: 's', kind: 'screen', name: 'S', width: 8, length: 20, travelRate: 75, targetEfficiency: 90, decks: [{ aperture: 19, openAreaPct: 61, openingShape: 'square' }], deckTargets: [one('c')], underTarget: one(PILE) },
      { id: 'c', kind: 'crusher', name: 'C', css: 13, capacity: 400, out: one('s') },
    ],
  };

  it('converges a wired recycle loop (deck→crusher→screen) and conserves mass', () => {
    const r = simulatePlant(looped);
    expect(r.runaway).toBe(false);
    expect(r.iterations).toBeGreaterThan(1); // needed iteration to settle the loop
    const crusher = r.nodes.find((n) => n.kind === 'crusher');
    expect(crusher && crusher.kind === 'crusher' && crusher.input.tph).toBeGreaterThan(0); // recirculating
    const total = r.piles.reduce((s, p) => s + p.stream.tph, 0);
    expect(total).toBeCloseTo(300, 0); // everything eventually exits as undersize
  });

  it('a coarser crusher gives a higher circulating load; every loop terminates within the cap', () => {
    const withCss = (css: number): Plant => ({ ...looped, units: looped.units.map((u) => (u.kind === 'crusher' ? { ...u, css } : u)) });
    const crIn = (r: ReturnType<typeof simulatePlant>) => {
      const c = r.nodes.find((n) => n.kind === 'crusher');
      return c && c.kind === 'crusher' ? c.input.tph : 0;
    };
    const fine = simulatePlant(withCss(13));
    const coarse = simulatePlant(withCss(38));
    expect(crIn(coarse)).toBeGreaterThan(crIn(fine)); // coarser recirculates more
    for (const r of [fine, coarse, simulatePlant(withCss(51))]) {
      expect(r.iterations).toBeLessThanOrEqual(1000); // never hangs
      if (!r.runaway) expect(r.piles.reduce((s, p) => s + p.stream.tph, 0)).toBeCloseTo(300, 0);
    }
  });

  describe('plant max feed / bottleneck', () => {
    const withFeed = (p: Plant, tph: number): Plant => ({ ...p, units: p.units.map((u) => (u.kind === 'feed' ? { ...u, tph } : u)) });
    const withinLimits = (p: Plant) => {
      const r = simulatePlant(p);
      const badScreen = r.nodes.some((n) => n.kind === 'screen' && !n.result.ok);
      const overCap = r.nodes.some((n) => n.kind === 'crusher' && n.overCapacity);
      return !r.runaway && !badScreen && !overCap;
    };

    it('reports a finite ceiling with a binding unit for the looped circuit', () => {
      const mf = plantMaxFeed(looped);
      expect(mf.feasible).toBe(true);
      expect(mf.runaway).toBe(false);
      expect(mf.maxFeedTph).toBeGreaterThan(0);
      expect(Number.isFinite(mf.maxFeedTph)).toBe(true);
      expect(mf.binding).not.toBeNull();
      // constraints are sorted tightest (lowest max feed) first
      expect(mf.binding!.maxFeedTph).toBeCloseTo(mf.maxFeedTph, 6);
    });

    it('the ceiling is a real boundary: within limits just below, something overflows just above', () => {
      const mf = plantMaxFeed(looped);
      // Ideal screening (realistic:false) scales exactly, so the edge is sharp.
      expect(withinLimits(withFeed(looped, mf.maxFeedTph * 0.95))).toBe(true);
      expect(withinLimits(withFeed(looped, mf.maxFeedTph * 1.1))).toBe(false);
    });

    it('a runaway circuit is flagged infeasible instead of returning a number', () => {
      // A crusher coarser than the deck barely reduces → the loop cannot drain.
      const runaway: Plant = { ...looped, units: looped.units.map((u) => (u.kind === 'crusher' ? { ...u, css: 51 } : u)) };
      const mf = plantMaxFeed(runaway);
      if (simulatePlant(runaway).runaway) {
        expect(mf.feasible).toBe(false);
        expect(mf.runaway).toBe(true);
      }
    });
  });
});

describe('realistic partition — numerical robustness', () => {
  it('a coarse particle reports 1 (not NaN) — exp() overflow guard', () => {
    // x = a·(d/d50) = 13·(1000/0.15) ≈ 87k → e^x overflows without the guard.
    expect(partitionToOversize(1000, 0.15, 13)).toBe(1);
    expect(Number.isFinite(partitionToOversize(1000, 0.15, 13))).toBe(true);
  });

  it('a fine deck fed coarse material splits without NaN and conserves mass', () => {
    const feed: Gradation = [{ size: 26.5, percentPassing: 100 }, { size: 9.5, percentPassing: 60 }, { size: 1, percentPassing: 20 }, { size: 0.075, percentPassing: 5 }];
    const r = realisticSplit(300, feed, 0.15, 90); // 0.15 mm deck, coarse feed
    expect(Number.isFinite(r.overflow.tph)).toBe(true);
    expect(Number.isFinite(r.throughflow.tph)).toBe(true);
    expect(r.overflow.gradation.every((p) => Number.isFinite(p.percentPassing))).toBe(true);
    expect(r.overflow.tph + r.throughflow.tph).toBeCloseTo(300, 0);
  });

  it('conserves mass even when the feed top point is below 100% passing', () => {
    const feed: Gradation = [{ size: 50, percentPassing: 90 }, { size: 9.5, percentPassing: 50 }, { size: 0.075, percentPassing: 5 }];
    const r = realisticSplit(200, feed, 9.5, 90);
    expect(r.overflow.tph + r.throughflow.tph).toBeCloseTo(200, 0);
  });
});

describe('bed depth', () => {
  it('scales inversely with bulk density (denser → thinner bed) and is unchanged at 100', () => {
    expect(bedDepth(100, 75, 8, 120)).toBeLessThan(bedDepth(100, 75, 8, 80));
    expect(bedDepth(100, 75, 8, 100)).toBeCloseTo(bedDepth(100, 75, 8), 6);
  });
});

describe('crusher types', () => {
  const feed: Gradation = [{ size: 300, percentPassing: 100 }, { size: 150, percentPassing: 60 }, { size: 50, percentPassing: 25 }, { size: 1, percentPassing: 2 }];
  const css = 50;
  it('each type gives a distinct product at the same setting', () => {
    const cone = crusherProduct(css, feed, 'cone');
    const jaw = crusherProduct(css, feed, 'jaw');
    const hsi = crusherProduct(css, feed, 'hsi');
    // % passing AT the setting: HSI (~85) > cone (~80) > jaw (~78)
    expect(percentPassing(hsi, css)).toBeGreaterThan(percentPassing(cone, css));
    expect(percentPassing(cone, css)).toBeGreaterThan(percentPassing(jaw, css));
    // HSI (impact) makes more fines than jaw down at 0.1×setting
    expect(percentPassing(hsi, css * 0.1)).toBeGreaterThan(percentPassing(jaw, css * 0.1));
  });
  it('gyratory shares the coarse jaw product curve', () => {
    expect(percentPassing(crusherProduct(css, feed, 'gyratory'), css)).toBeCloseTo(percentPassing(crusherProduct(css, feed, 'jaw'), css), 6);
  });
  it('defaults to the cone curve when no type is given', () => {
    expect(crusherProduct(css, feed)).toEqual(crusherProduct(css, feed, 'cone'));
  });

  it('VSI is speed-driven: faster rotor makes a finer product, mildly reducing top size', () => {
    const slow = crusherProduct(45, feed, 'vsi'); // low speed → ~no reduction
    const fast = crusherProduct(75, feed, 'vsi'); // high speed → more fines
    const p80 = (g: ReturnType<typeof crusherProduct>) => sizeAtPassing(g, 80);
    expect(p80(fast)).toBeLessThan(p80(slow)); // faster → finer
    // fast keeps most of the top size (reduction only ~1.5), not a big drop
    const top = (g: ReturnType<typeof crusherProduct>) => Math.max(...g.map((x) => x.size));
    expect(top(fast)).toBeGreaterThan(top(slow) / 2);
    expect(fast.every((x) => Number.isFinite(x.percentPassing))).toBe(true);
  });
});

describe('max feed finder', () => {
  it('finds a feed that is exactly on the edge: fine at max, overflowing just above', () => {
    const cap = 200;
    const mf = findMaxFeed(defaultProject, cap);
    expect(mf.feasible).toBe(true);
    expect(mf.maxFeedTph).toBeGreaterThan(0);

    // Just below the max nothing overflows (at exactly the max the binding deck
    // sits on utilization === 1, which is floating-point-fragile).
    const belowMax = simulate({ ...defaultProject, feed: { ...defaultProject.feed, tph: mf.maxFeedTph * 0.999 } });
    expect(belowMax.decks.every((d) => d.adequate && d.bedDepthOk)).toBe(true);
    expect(belowMax.recirculationTph).toBeLessThanOrEqual(cap + 1);

    // ...but 5% more feed does overflow something.
    const over = simulate({ ...defaultProject, feed: { ...defaultProject.feed, tph: mf.maxFeedTph * 1.05 } });
    const screenOver = over.decks.some((d) => !d.adequate || !d.bedDepthOk);
    const crusherOver = over.recirculationTph > cap + 1e-6;
    expect(screenOver || crusherOver).toBe(true);
  });

  it('names the binding constraint consistent with the state at the limit', () => {
    const mf = findMaxFeed(defaultProject, 200);
    if (mf.binding === 'crusher') {
      expect(mf.crusherThroughputTph).toBeCloseTo(200, 0);
    } else if (mf.binding === 'screen') {
      const td = mf.atMax.decks[mf.tightestDeck];
      // Whichever limit bit is at its edge at the max feed.
      if (mf.screenLimitedByBedDepth) expect(td.bedDepth).toBeCloseTo(td.bedDepthLimit, 0);
      else expect(td.utilization).toBeCloseTo(1, 1);
    }
  });

  it('a smaller crusher capacity never allows a larger feed', () => {
    const big = findMaxFeed(defaultProject, 400).maxFeedTph;
    const small = findMaxFeed(defaultProject, 100).maxFeedTph;
    expect(small).toBeLessThanOrEqual(big + 1e-6);
  });

  it('sweeps every crusher setting and returns a row each', () => {
    const rows = sweepMaxFeed(defaultProject, CRUSHER_SETTINGS, 200);
    expect(rows).toHaveLength(CRUSHER_SETTINGS.length);
    expect(rows.every((r) => r.result.maxFeedTph >= 0)).toBe(true);
  });
});
