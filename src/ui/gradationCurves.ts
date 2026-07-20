// Build the gradation curves (feed, each screen deck's oversize + undersize, and
// each crusher's product) for the whole routed plant. Used by the Gradation tab
// and the datasheet.
import type { Plant } from '../model/plant';
import type { PlantResult } from '../engine/plant';
import { sieveLabel } from '../model/sieves';
import type { Curve } from './GradationChart';

export type CurveCategory = 'feed' | 'screen' | 'crusher' | 'pile';

/** A chart curve plus the stream tonnage it represents and its category. */
export interface StreamCurve extends Curve {
  tph: number;
  category: CurveCategory;
}

// A wide, distinct palette so busy plants don't reuse colours; after a full
// cycle we switch to dashed so even a repeated hue stays distinguishable.
const PRODUCT_PALETTE = ['#e8622c', '#2c7be8', '#1f9d55', '#8a4fce', '#c9a227', '#0f9b9b', '#d1478a', '#7a5c2e', '#5b6bb0', '#4f8f2f'];
const FEED_COLORS = ['#555', '#8a5a2b', '#2b6b8a', '#6a3d8a'];
const CRUSHER_PALETTE = ['#b0341d', '#d9640f', '#8a2d5a', '#9a5b1a'];
// Combined stockpiles: dark, solid — read as the plant's final products.
const PILE_PALETTE = ['#12203f', '#5c2d91', '#0b6e4f', '#7a1f3d'];

/** A stream is worth plotting only if it carries real tonnage and enough points. */
const drawable = (g: { length: number }, tph: number) => tph > 0.5 && g.length > 1;

export function buildPlantCurves(plant: Plant, result: PlantResult): StreamCurve[] {
  const cs: StreamCurve[] = [];
  const feeds = plant.units.filter((u) => u.kind === 'feed');
  feeds.forEach((f, i) => {
    if (f.kind !== 'feed') return;
    cs.push({ key: `feed:${f.id}`, label: feeds.length > 1 ? f.name : 'Fresh feed', color: feeds.length > 1 ? FEED_COLORS[i % FEED_COLORS.length] : '#555', gradation: f.gradation, tph: f.tph, category: 'feed' });
  });

  let pi = 0;
  const nextProduct = () => {
    const idx = pi++;
    return { color: PRODUCT_PALETTE[idx % PRODUCT_PALETTE.length], dashed: Math.floor(idx / PRODUCT_PALETTE.length) % 2 === 1 };
  };
  let cri = 0;
  // Prefix labels with the unit name only when there's more than one screen.
  const multiScreen = result.nodes.filter((n) => n.kind === 'screen').length > 1;

  result.nodes.forEach((n) => {
    if (n.kind === 'screen') {
      const prefix = multiScreen ? `${n.name} · ` : '';
      n.result.products.forEach((p, di) => {
        if (!drawable(p.stream.gradation, p.stream.tph)) return;
        const c = nextProduct();
        cs.push({ key: `${n.id}-d${di}`, label: `${prefix}Deck ${di + 1} (+${sieveLabel(p.aperture)})`, color: c.color, dashed: c.dashed, gradation: p.stream.gradation, tph: p.stream.tph, category: 'screen' });
      });
      if (drawable(n.result.undersize.gradation, n.result.undersize.tph)) {
        const c = nextProduct();
        cs.push({ key: `${n.id}-u`, label: `${prefix}undersize`, color: c.color, dashed: c.dashed, gradation: n.result.undersize.gradation, tph: n.result.undersize.tph, category: 'screen' });
      }
    } else if (n.kind === 'crusher' && drawable(n.output.gradation, n.output.tph)) {
      cs.push({ key: `${n.id}-p`, label: `${n.name} product`, color: CRUSHER_PALETTE[cri++ % CRUSHER_PALETTE.length], dashed: true, gradation: n.output.gradation, tph: n.output.tph, category: 'crusher' });
    }
  });

  // Every product pile (the plant's final products), as dark solid curves.
  let pli = 0;
  result.piles.forEach((p) => {
    if (!drawable(p.stream.gradation, p.stream.tph)) return;
    cs.push({ key: `pile:${p.key}`, label: p.product, color: PILE_PALETTE[pli++ % PILE_PALETTE.length], gradation: p.stream.gradation, tph: p.stream.tph, category: 'pile' });
  });
  return cs;
}
