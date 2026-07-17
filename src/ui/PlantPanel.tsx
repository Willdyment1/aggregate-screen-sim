import { useMemo } from 'react';
import type { Plant } from '../model/plant';
import { addUnit, addFeed, addPile } from '../model/plantOps';
import type { PlantResult } from '../engine/plant';
import { sizeAtPassing } from '../engine/gradation';
import { FeedCard, ScreenCard, CrusherCard, PileCard } from './unitCards';

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : '—');
const mm = (n: number) => (Number.isFinite(n) ? (n < 1 ? n.toFixed(2) : n.toFixed(1)) : '—');

export function PlantPanel({ plant, result, onChange }: { plant: Plant; result: PlantResult; onChange: (p: Plant) => void }) {
  const nodeById = useMemo(() => new Map(result.nodes.map((n) => [n.id, n])), [result]);

  return (
    <section className="panel plantpanel">
      <div className="plant-head">
        <h2>Plant builder</h2>
        <label className="checkbox">
          <input type="checkbox" checked={plant.realistic} onChange={(e) => onChange({ ...plant, realistic: e.target.checked })} />
          Realistic screening
        </label>
      </div>
      <p className="design-intro">
        Add screens and crushers, then <strong>route each output anywhere</strong> — send a deck's oversize to a
        crusher, a crusher back to a screen (a closed circuit), or to a product pile. Prefer dragging boxes around?
        Build the same plant visually on the <strong>Flowsheet</strong> tab — the two stay in sync.
      </p>

      {plant.units.map((u) => {
        if (u.kind === 'feed') return <FeedCard key={u.id} plant={plant} u={u} onChange={onChange} />;
        return (
          <div key={u.id} className="plant-flow">
            <div className="plant-arrow">▼</div>
            {u.kind === 'screen' ? (
              <ScreenCard plant={plant} u={u} node={nodeById.get(u.id)} onChange={onChange} />
            ) : u.kind === 'pile' ? (
              <PileCard plant={plant} u={u} onChange={onChange} />
            ) : (
              <CrusherCard plant={plant} u={u} node={nodeById.get(u.id)} onChange={onChange} />
            )}
          </div>
        );
      })}

      <div className="plant-add-row">
        <span className="plant-arrow">▼</span>
        <button className="secondary" onClick={() => onChange(addUnit(plant, 'screen').plant)}>+ Add screen</button>
        <button className="secondary" onClick={() => onChange(addUnit(plant, 'crusher').plant)}>+ Add crusher</button>
        <button className="secondary" onClick={() => onChange(addFeed(plant).plant)}>+ Add feed</button>
        <button className="secondary" onClick={() => onChange(addPile(plant).plant)}>+ Add stockpile</button>
      </div>

      {result.runaway && (
        <div className="crusher-status fail" role="alert">
          ⛔ A recycle loop is running away — a crusher isn't reducing enough to drain the circuit, so the
          recirculating load never settles. Use a finer crusher setting or re-route the loop.
        </div>
      )}

      <h3>Product piles</h3>
      <div className="mf-table-wrap">
        <table className="products-table">
          <thead>
            <tr><th>Pile</th><th>tph</th><th>% of feed</th><th>Top</th><th>P80</th></tr>
          </thead>
          <tbody>
            {result.piles.length === 0 && (
              <tr><td colSpan={5} className="note">Nothing routed to a pile yet — set some outputs to “Product pile”.</td></tr>
            )}
            {result.piles.map((p, i) => {
              const top = p.stream.gradation.length ? Math.max(...p.stream.gradation.map((g) => g.size)) : 0;
              return (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td className="num">{round(p.stream.tph)}</td>
                  <td className="num">{((p.stream.tph / (result.feedTph || 1)) * 100).toFixed(1)}%</td>
                  <td className="num">{mm(top)}</td>
                  <td className="num">{mm(sizeAtPassing(p.stream.gradation, 80))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">Top / P80 in mm.</p>
      </div>
    </section>
  );
}
