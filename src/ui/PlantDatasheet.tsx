// Print-only plant report (Export PDF). Summarises the whole multi-unit plant:
// feeds, gradation curves, every screen/crusher's loading, product piles and the
// throughput bottleneck. Hidden on screen, shown by @media print.
import type { Plant, PlantScreen, PlantCrusher } from '../model/plant';
import type { PlantResult } from '../engine/plant';
import { plantMaxFeed } from '../engine/plantMaxFeed';
import { sizeAtPassing } from '../engine/gradation';
import { sieveLabel } from '../model/sieves';
import { matchPreset } from '../model/feedPresets';
import { CRUSHER_SPECS } from '../engine/crusher';
import { GradationChart } from './GradationChart';
import { buildPlantCurves } from './gradationCurves';

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : '—');
const mm = (n: number) => (Number.isFinite(n) ? (n < 1 ? n.toFixed(2) : n.toFixed(1)) : '—');
const pct1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');

export function PlantDatasheet({ plant, result, name, date }: { plant: Plant; result: PlantResult; name: string; date: string }) {
  const feeds = plant.units.filter((u) => u.kind === 'feed');
  const totalFeed = feeds.reduce((s, f) => s + (f.kind === 'feed' ? f.tph : 0), 0);
  const screens = result.nodes.filter((n) => n.kind === 'screen');
  const crushers = result.nodes.filter((n) => n.kind === 'crusher');
  const overloaded = screens.filter((s) => s.kind === 'screen' && !s.result.ok).length;
  const overcap = crushers.filter((c) => c.kind === 'crusher' && c.overCapacity).length;
  const productTph = result.piles.reduce((s, p) => s + p.stream.tph, 0);
  const mf = plantMaxFeed(plant, result);
  const curves = buildPlantCurves(plant, result);
  const status = result.runaway ? 'Runaway recycle loop' : overloaded || overcap ? `${[overloaded && `${overloaded} screen(s) overloaded`, overcap && `${overcap} crusher(s) over capacity`].filter(Boolean).join(', ')}` : 'All units within limits';

  return (
    <div className="datasheet">
      <div className="ds-head">
        <div>
          <h1>{name || 'Plant'} — Datasheet</h1>
          <p className="ds-sub">Aggregate Screening Simulator · VSMA factor method · {date}</p>
        </div>
        <table className="ds-kpi">
          <tbody>
            <tr><th>Fresh feed</th><td>{round(totalFeed)} tph{feeds.length > 1 ? ` (${feeds.length} feeds)` : ''}</td></tr>
            <tr><th>Products</th><td>{round(productTph)} tph · {result.piles.length} piles</td></tr>
            <tr><th>Units</th><td>{screens.length} screen · {crushers.length} crusher</td></tr>
            <tr><th>Max feed</th><td>{mf.binding ? `≈ ${round(mf.maxFeedTph)} tph (limited by ${mf.binding.unitName})` : '—'}</td></tr>
            <tr><th>Status</th><td>{status}</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Feed</h2>
      <table className="ds-table">
        <thead><tr><th>Feed</th><th>Material</th><th>Rate (tph)</th><th>Density (lb/ft³)</th><th>Wet</th></tr></thead>
        <tbody>
          {feeds.map((f) => f.kind === 'feed' && (
            <tr key={f.id}><td>{f.name}</td><td>{matchPreset(f.gradation)}</td><td className="num">{round(f.tph)}</td><td className="num">{round(f.bulkDensity)}</td><td>{f.wet ? 'Yes' : 'No'}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Gradation</h2>
      <div className="ds-chart">
        <GradationChart curves={curves} width={680} height={340} />
        <div className="ds-legend">
          {curves.map((c) => (
            <span key={c.key} className="ds-leg"><span className="swatch" style={{ background: c.color }} /> {c.label}</span>
          ))}
        </div>
      </div>

      <h2>Units</h2>
      {result.nodes.map((n) => {
        if (n.kind === 'screen') {
          const su = plant.units.find((u) => u.id === n.id) as PlantScreen | undefined;
          return (
            <div key={n.id} className="ds-unit">
              <h3>{n.name} — {su ? `${su.width}×${su.length} ft, ${su.travelRate} fpm, target ${su.targetEfficiency}%` : ''} · {round(n.input.tph)} tph in · <span className={n.result.ok ? 'ds-ok' : 'ds-bad'}>{n.result.ok ? 'OK' : 'OVERLOADED'}</span></h3>
              <table className="ds-table">
                <thead><tr><th>Deck</th><th>Opening</th><th>Shape</th><th>OA%</th><th>Feed (tph)</th><th>Undersize (tph)</th><th>Req. area</th><th>Actual area</th><th>Load</th><th>Eff.</th><th>Bed (mm)</th></tr></thead>
                <tbody>
                  {n.result.decks.map((d, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{sieveLabel(d.aperture)}</td>
                      <td>{su?.decks[i]?.openingShape ?? 'square'}</td>
                      <td className="num">{su?.decks[i]?.openAreaPct ?? '—'}</td>
                      <td className="num">{round(d.feedTph)}</td>
                      <td className="num">{round(d.undersizeTph)}</td>
                      <td className="num">{d.requiredArea.toFixed(1)}</td>
                      <td className="num">{round(d.actualArea)}</td>
                      <td className={`num ${d.adequate ? '' : 'ds-bad'}`}>{d.actualArea > 0 ? `${round((d.requiredArea / d.actualArea) * 100)}%` : '∞'}</td>
                      <td className="num">{d.achievedEfficiency < d.efficiency - 0.5 ? `${round(d.efficiency)}→${round(d.achievedEfficiency)}%` : `${round(d.efficiency)}%`}</td>
                      <td className={`num ${d.bedDepthOk ? '' : 'ds-bad'}`}>{round(d.bedDepth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const cu = plant.units.find((u) => u.id === n.id) as PlantCrusher | undefined;
        const spec = CRUSHER_SPECS[cu?.crusherType ?? 'cone'];
        return (
          <div key={n.id} className="ds-unit">
            <h3>{n.name} — {spec.label} · {round(n.input.tph)} tph in · <span className={n.overCapacity ? 'ds-bad' : 'ds-ok'}>{n.overCapacity ? 'OVER CAP' : 'OK'}</span></h3>
            <table className="ds-table">
              <thead><tr><th>Type</th><th>{spec.settingLabel} ({spec.settingUnit})</th><th>Capacity (tph)</th><th>Throughput</th><th>Reduction</th><th>Product top</th><th>Product P80</th></tr></thead>
              <tbody>
                <tr>
                  <td>{spec.label}</td>
                  <td className="num">{cu?.css ?? '—'}</td>
                  <td className="num">{round(n.capacity)}</td>
                  <td className={`num ${n.overCapacity ? 'ds-bad' : ''}`}>{round(n.input.tph)} / {round(n.capacity)}</td>
                  <td className="num">{n.reductionRatio.toFixed(1)}:1</td>
                  <td className="num">{mm(n.output.gradation.length ? Math.max(...n.output.gradation.map((g) => g.size)) : 0)} mm</td>
                  <td className="num">{mm(sizeAtPassing(n.output.gradation, 80))} mm</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <h2>Product piles</h2>
      <table className="ds-table">
        <thead><tr><th>Pile</th><th>tph</th><th>% of feed</th><th>Top (mm)</th><th>P80 (mm)</th></tr></thead>
        <tbody>
          {result.piles.map((p, i) => {
            const top = p.stream.gradation.length ? Math.max(...p.stream.gradation.map((g) => g.size)) : 0;
            return (
              <tr key={i}><td>{p.label}</td><td className="num">{round(p.stream.tph)}</td><td className="num">{pct1((p.stream.tph / (result.feedTph || 1)) * 100)}%</td><td className="num">{mm(top)}</td><td className="num">{mm(sizeAtPassing(p.stream.gradation, 80))}</td></tr>
            );
          })}
        </tbody>
      </table>

      {mf.constraints.length > 0 && (
        <>
          <h2>Throughput / bottleneck</h2>
          <p className="ds-sub">Estimated max fresh feed ≈ <strong>{round(mf.maxFeedTph)} tph</strong>{mf.binding ? `, limited by ${mf.binding.unitName} (${mf.binding.detail})` : ''}. Current {round(mf.currentFeedTph)} tph.</p>
          <table className="ds-table">
            <thead><tr><th>Unit</th><th>Tightest limit</th><th>Load now</th><th>Max feed (tph)</th></tr></thead>
            <tbody>
              {mf.constraints.filter((c, i, a) => a.findIndex((x) => x.unitId === c.unitId) === i).map((c) => (
                <tr key={c.unitId}><td>{c.unitName}</td><td>{c.detail}</td><td className="num">{round(c.loadPct)}%</td><td className="num">{round(c.maxFeedTph)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
