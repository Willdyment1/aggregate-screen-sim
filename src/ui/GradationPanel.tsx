import { useMemo, useState } from 'react';
import type { Plant } from '../model/plant';
import type { PlantResult } from '../engine/plant';
import { STANDARD_SIEVES, sieveLabel } from '../model/sieves';
import { percentPassing, sizeAtPassing } from '../engine/gradation';
import { GradationChart } from './GradationChart';
import { buildPlantCurves, type CurveCategory } from './gradationCurves';
import { InfoTip } from './InfoTip';

interface Props {
  plant: Plant;
  result: PlantResult;
}

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : '—');
const mm = (n: number) => (Number.isFinite(n) ? (n < 1 ? n.toFixed(2) : n.toFixed(1)) : '—');

export function GradationPanel({ plant, result }: Props) {
  const curves = useMemo(() => buildPlantCurves(plant, result), [plant, result]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  // Category filter — default to the endpoints (feed + product piles); screen and
  // crusher streams are intermediate, toggled on when you want to dig in.
  const CATS: { id: CurveCategory; label: string }[] = [
    { id: 'feed', label: 'Feeds' },
    { id: 'pile', label: 'Product piles' },
    { id: 'screen', label: 'Screen streams' },
    { id: 'crusher', label: 'Crusher products' },
  ];
  const present = new Set(curves.map((c) => c.category));
  const [activeCats, setActiveCats] = useState<Set<CurveCategory>>(new Set<CurveCategory>(['feed', 'pile']));
  const toggleCat = (id: CurveCategory) =>
    setActiveCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const catCurves = curves.filter((c) => activeCats.has(c.category));
  const visible = catCurves.filter((c) => !hidden.has(c.key));
  const anyHidden = catCurves.some((c) => hidden.has(c.key));

  // Deck-opening markers (unique apertures across every screen).
  const markers = useMemo(() => {
    const seen = new Map<number, string>();
    plant.units.forEach((u) => {
      if (u.kind === 'screen') u.decks.forEach((d) => seen.set(d.aperture, sieveLabel(d.aperture)));
    });
    return [...seen.entries()].map(([size, label]) => ({ size, label }));
  }, [plant]);

  const feed = plant.units.find((u) => u.kind === 'feed');
  const fresh = result.feedTph || 1;
  const feedTop = feed ? Math.max(0, ...feed.gradation.map((p) => p.size)) : 0;
  const sieves = STANDARD_SIEVES.filter((s) => s.mm <= feedTop * 1.2);

  return (
    <section className="panel gradpanel">
      <h2>Gradation curves</h2>
      <p className="design-intro">
        The plant's gradations — the fresh <strong>feed</strong>, the final <strong>product piles</strong>, and
        (toggle them on) the intermediate <strong>screen</strong> and <strong>crusher</strong> streams.
        <strong> Click a line</strong> to read the sieve size and % passing at any point; click a legend entry to
        hide / show it.
      </p>

      <div className="cat-filter">
        <span className="cat-filter-label">Show:</span>
        {CATS.filter((c) => present.has(c.id)).map((c) => {
          const on = activeCats.has(c.id);
          return (
            <button key={c.id} type="button" className={`cat-chip${on ? ' on' : ''}`} onClick={() => toggleCat(c.id)} aria-pressed={on}>
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="chart-scroll">
        <GradationChart curves={visible} markers={markers} width={640} height={380} />
      </div>
      <div className="legend-tools">
        <button className="link-btn" onClick={() => setHidden(new Set())} disabled={!anyHidden}>
          Select all
        </button>
        <span className="legend-tools-sep">·</span>
        <button className="link-btn" onClick={() => setHidden(new Set(catCurves.map((c) => c.key)))} disabled={visible.length === 0}>
          Deselect all
        </button>
      </div>
      <div className="legend">
        {catCurves.map((c) => {
          const off = hidden.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              className={`legend-item${off ? ' off' : ''}`}
              onClick={() => toggle(c.key)}
              aria-pressed={!off}
            >
              <span
                className="swatch"
                style={{ background: c.color, ...(c.dashed ? { backgroundImage: `repeating-linear-gradient(90deg,${c.color} 0 4px,transparent 4px 7px)` } : {}) }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      <h3>
        Stream summary
        <InfoTip text="Tonnage and key size points for each stream. P80/P50/P20 = the sieve size that 80 / 50 / 20 percent of the stream passes (P50 is the median size)." />
      </h3>
      <div className="mf-table-wrap">
        <table className="grad-stats">
          <thead>
            <tr>
              <th>Stream</th>
              <th>tph</th>
              <th>% of feed</th>
              <th>Top</th>
              <th>P80</th>
              <th>P50</th>
              <th>P20</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const g = c.gradation;
              const top = g.length ? Math.max(...g.map((p) => p.size)) : 0;
              return (
                <tr key={c.key}>
                  <td>
                    <span className="swatch" style={{ background: c.color }} /> {c.label}
                  </td>
                  <td className="num">{round(c.tph)}</td>
                  <td className="num">{((c.tph / fresh) * 100).toFixed(1)}%</td>
                  <td className="num">{mm(top)}</td>
                  <td className="num">{mm(sizeAtPassing(g, 80))}</td>
                  <td className="num">{mm(sizeAtPassing(g, 50))}</td>
                  <td className="num">{mm(sizeAtPassing(g, 20))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">Top / P-values in mm. % of feed is relative to fresh feed.</p>
      </div>

      <h3>
        % passing by sieve
        <InfoTip text="The full sieve analysis: what percent of each stream passes each standard sieve. This is the tabular version of the chart above." />
      </h3>
      <div className="mf-table-wrap">
        <table className="grad-sieve">
          <thead>
            <tr>
              <th>Sieve</th>
              {visible.map((c) => (
                <th key={c.key} title={c.label}>
                  <span className="swatch" style={{ background: c.color }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sieves.map((s) => (
              <tr key={s.mm}>
                <td className="sieve-name">
                  {s.label} <span className="sieve-mm">({s.mm} mm)</span>
                </td>
                {visible.map((c) => (
                  <td key={c.key} className="num">
                    {percentPassing(c.gradation, s.mm).toFixed(0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Column colours match the chart legend. Values are % passing.</p>
    </section>
  );
}
