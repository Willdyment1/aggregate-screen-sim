// Plain-language verdict for the results — turns the numbers into a one-line
// "does it work, and what's the limiting factor" answer.
import type { Project, SimulationResult } from '../model/types';
import { sieveLabel } from '../model/sieves';

export interface Verdict {
  ok: boolean;
  headline: string;
  detail: string;
}

export function screenVerdict(project: Project, result: SimulationResult): Verdict {
  const decks = result.decks;
  const w = project.screen.width;
  const l = project.screen.length;
  const rate = result.freshFeedTph.toFixed(0);

  if (decks.length === 0) {
    return { ok: false, headline: 'Add at least one deck to size the screen.', detail: '' };
  }

  const overloaded = decks.filter((d) => !d.adequate);
  if (overloaded.length > 0) {
    const worst = [...overloaded].sort((a, b) => a.utilization - b.utilization)[0];
    return {
      ok: false,
      headline: `⚠ Overloaded — deck ${worst.deckIndex + 1} (${sieveLabel(worst.aperture)}) needs ${worst.requiredArea.toFixed(0)} ft² but only has ${worst.actualArea.toFixed(0)} ft².`,
      detail: 'Increase the screen size, reduce the feed rate, or split the duty across more decks.',
    };
  }

  // All decks adequate — report the tightest (lowest spare capacity).
  const binding = [...decks].sort((a, b) => a.utilization - b.utilization)[0];
  const load = binding.actualArea > 0 ? (binding.requiredArea / binding.actualArea) * 100 : 0;
  const deepBed = decks.filter((d) => !d.bedDepthOk);
  let detail = `Tightest: deck ${binding.deckIndex + 1} (${sieveLabel(binding.aperture)}) is using ${load.toFixed(0)}% of its capacity.`;
  if (result.closedCircuit && result.recirculationTph > 0) {
    detail += ` Recirculating load ${result.recirculationTph.toFixed(0)} tph.`;
  }
  if (deepBed.length > 0) {
    detail += ` ⚠ Bed too deep on deck ${deepBed[0].deckIndex + 1} — screening may suffer.`;
  }
  return {
    ok: true,
    headline: `✓ This ${w}′×${l}′ screen handles ${rate} tph.`,
    detail,
  };
}
