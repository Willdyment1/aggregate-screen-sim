import type { PlantMaxFeed } from '../engine/plantMaxFeed';

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : '—');
const barTone = (load: number) => (load >= 100 ? 'over' : load >= 85 ? 'warn' : 'ok');
const limitWord: Record<string, string> = {
  'deck-area': 'area',
  'bed-depth': 'bed depth',
  'crusher-capacity': 'capacity',
};

/** Plant-wide max-feed / bottleneck readout. */
export function PlantMaxFeedPanel({ mf, onSetFeed }: { mf: PlantMaxFeed; onSetFeed: (tph: number) => void }) {
  if (mf.runaway) {
    return (
      <div className="pmf-note fail" role="alert">
        ⛔ The circuit is running away — a recycle loop won't drain. Fix the crusher setting or re-route the loop
        before sizing the max feed.
      </div>
    );
  }
  if (!mf.binding || !Number.isFinite(mf.maxFeedTph)) {
    return <div className="pmf-note">Nothing limits the feed yet — add a screen or crusher on the Plant tab.</div>;
  }

  const max = mf.maxFeedTph;
  const cur = mf.currentFeedTph;
  const load = mf.binding.loadPct;
  // A small tolerance so sitting exactly on the ceiling reads "at the limit"
  // rather than a rounding-artefact "over by 1 tph".
  const tone = load > 101 ? 'over' : load >= 85 ? 'warn' : 'ok';
  const headroom =
    load > 101 ? `over by ${round(cur - max)} tph — reduce feed` : load >= 98 ? 'at the limit' : `${round(max - cur)} tph of headroom`;

  // Show each unit once, at its tightest constraint, tightest first.
  const seen = new Set<string>();
  const perUnit = mf.constraints.filter((c) => (seen.has(c.unitId) ? false : (seen.add(c.unitId), true)));

  return (
    <div className="pmf">
      <div className={`pmf-headline lvl-${tone}`}>
        <div>
          <div className="pmf-label">Max fresh feed (estimate)</div>
          <div className="pmf-value">{round(max)} tph</div>
          <div className="pmf-sub">
            limited by <strong>{mf.binding.unitName}</strong> — {mf.binding.detail} · now {round(cur)} tph ({headroom})
          </div>
        </div>
        <button className="secondary" onClick={() => onSetFeed(Math.max(0, Math.floor(max)))} disabled={Math.round(cur) === Math.floor(max)}>
          Set feed to {round(Math.floor(max))}
        </button>
      </div>

      <table className="pmf-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Tightest limit</th>
            <th>Load now</th>
            <th>Max feed</th>
          </tr>
        </thead>
        <tbody>
          {perUnit.map((c) => {
            const t = barTone(c.loadPct);
            return (
              <tr key={c.unitId}>
                <td>{c.unitName}</td>
                <td className="pmf-limit">
                  <span className={`pmf-tag ${c.kind}`}>{limitWord[c.limit]}</span> {c.detail}
                </td>
                <td className="pmf-loadcell">
                  <span className="pmf-bar">
                    <span className={`pmf-bar-fill ${t}`} style={{ width: `${Math.min(100, c.loadPct)}%` }} />
                  </span>
                  <span className={`pmf-loadnum ${t === 'over' ? 'over-limit' : ''}`}>{round(c.loadPct)}%</span>
                </td>
                <td className="num">{round(c.maxFeedTph)} tph</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">
        Estimated by scaling the current circuit linearly with feed (recycle loads included). Area &amp; crusher
        limits are near-exact; bed-depth shifts slightly under realistic screening.
      </p>
    </div>
  );
}
