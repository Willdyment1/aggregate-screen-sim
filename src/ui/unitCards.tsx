// Unit editor cards shared by the Plant tab and the Flowsheet inspector, so both
// edit the plant through the exact same controls. Each card is self-sufficient:
// give it the plant + an onChange, and it applies plantOps internally.
import { useEffect, useState } from 'react';
import type { OpeningShape } from '../model/types';
import type { Plant, PlantFeed, PlantScreen, PlantCrusher, Target, Split, CrusherType } from '../model/plant';
import { PILE, targetOptions } from '../model/plant';
import { setUnit, setDeck, addDeck, removeDeck, removeUnit } from '../model/plantOps';
import type { PlantNode } from '../engine/plant';
import { sieveLabel } from '../model/sieves';
import { CRUSHER_SPECS, CRUSHER_TYPE_LIST } from '../engine/crusher';
import { FEED_PRESETS } from '../model/feedPresets';
import { NumberField } from './NumberField';
import { SieveSelect } from './SieveSelect';

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : '—');

/** Opening shapes (affect the VSMA H factor / screening area). */
export const OPENING_SHAPES: { v: OpeningShape; l: string }[] = [
  { v: 'square', l: 'Square' },
  { v: 'shortSlot', l: 'Short slot' },
  { v: 'longSlot', l: 'Long slot' },
];

/** A percent field you can type freely: selects on focus, commits on blur/Enter. */
function PctInput({ value, onCommit }: { value: number; onCommit: (pct: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) onCommit(Math.max(0, Math.min(100, n)));
    else setText(String(value));
  };
  return (
    <input
      className="route-pct"
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      aria-label="split percent"
    />
  );
}

function TargetSelect({ plant, value, selfId, onChange }: { plant: Plant; value: Target; selfId: string; onChange: (t: Target) => void }) {
  return (
    <select className="route-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {targetOptions(plant, selfId).map((o) => (
        <option key={o.id} value={o.id}>
          {o.id === PILE ? '▸ Product pile' : `→ ${o.label}`}
        </option>
      ))}
    </select>
  );
}

/** Route an output to one destination or split it across several by % (sum-locked). */
export function RouteEditor({ plant, routes, selfId, onChange }: { plant: Plant; routes: Split; selfId: string; onChange: (r: Split) => void }) {
  const rs = routes && routes.length ? routes : [{ to: PILE, frac: 1 }];
  const setTarget = (i: number, to: Target) => onChange(rs.map((r, j) => (j === i ? { ...r, to } : r)));
  const setFrac = (i: number, v: number) => {
    const val = Math.max(0, Math.min(1, v));
    const otherSum = rs.reduce((a, r, j) => (j === i ? a : a + r.frac), 0);
    const rem = 1 - val;
    onChange(rs.map((r, j) => (j === i ? { ...r, frac: val } : { ...r, frac: otherSum > 0 ? (r.frac / otherSum) * rem : rem / (rs.length - 1) })));
  };
  const addRoute = () => {
    const nn = rs.length + 1;
    onChange([...rs, { to: PILE, frac: 0 }].map((r) => ({ ...r, frac: 1 / nn })));
  };
  const removeRoute = (i: number) => {
    const next = rs.filter((_, j) => j !== i);
    if (!next.length) return onChange([{ to: PILE, frac: 1 }]);
    const s = next.reduce((a, r) => a + r.frac, 0);
    onChange(next.map((r) => ({ ...r, frac: s > 0 ? r.frac / s : 1 / next.length })));
  };
  if (rs.length === 1) {
    return (
      <span className="route-edit">
        <TargetSelect plant={plant} value={rs[0].to} selfId={selfId} onChange={(t) => setTarget(0, t)} />
        <button className="link-btn route-split-btn" onClick={addRoute}>+ split</button>
      </span>
    );
  }
  return (
    <div className="route-edit multi">
      {rs.map((r, i) => (
        <div key={i} className="route-line">
          <TargetSelect plant={plant} value={r.to} selfId={selfId} onChange={(t) => setTarget(i, t)} />
          <PctInput value={Math.round(r.frac * 100)} onCommit={(pct) => setFrac(i, pct / 100)} />
          <span className="route-pct-sign">%</span>
          <button className="link-btn" onClick={() => removeRoute(i)} aria-label="remove destination">✕</button>
        </div>
      ))}
      <button className="link-btn route-split-btn" onClick={addRoute}>+ split</button>
    </div>
  );
}

export function FeedCard({ plant, u, onChange, showRoute = true }: { plant: Plant; u: PlantFeed; onChange: (p: Plant) => void; showRoute?: boolean }) {
  const preset = FEED_PRESETS.find((x) => JSON.stringify(x.gradation) === JSON.stringify(u.gradation));
  const canRemove = plant.units.filter((x) => x.kind === 'feed').length > 1;
  return (
    <div className="plant-unit feed-unit">
      <div className="plant-unit-h">
        <span className="unit-kind">Feed</span>
        <input className="unit-name" value={u.name} onChange={(e) => onChange(setUnit(plant, u.id, { name: e.target.value }))} />
        <span className="plant-input">{round(u.tph)} tph</span>
        {canRemove && <button className="link-btn" onClick={() => onChange(removeUnit(plant, u.id))} aria-label="remove feed">✕</button>}
      </div>
      <div className="field-grid">
        <label className="span2">
          Material / size
          <select value={preset?.name ?? 'custom'} onChange={(e) => { const pr = FEED_PRESETS.find((x) => x.name === e.target.value); if (pr) onChange(setUnit(plant, u.id, { gradation: pr.gradation })); }}>
            {FEED_PRESETS.map((pr) => (<option key={pr.name} value={pr.name}>{pr.name}</option>))}
            {!preset && <option value="custom">Custom</option>}
          </select>
        </label>
        <label>Feed rate (tph)<NumberField value={u.tph} min={0} onChange={(v) => onChange(setUnit(plant, u.id, { tph: v }))} /></label>
        <label>Bulk density (lb/ft³)<NumberField value={u.bulkDensity} min={0} onChange={(v) => onChange(setUnit(plant, u.id, { bulkDensity: v }))} /></label>
        <label className="pv-check span2">
          <input type="checkbox" checked={u.wet} onChange={(e) => onChange(setUnit(plant, u.id, { wet: e.target.checked }))} />
          Wet feed
        </label>
      </div>
      {showRoute && (
        <div className="plant-route">
          <span className="route-label">Feed goes</span>
          <RouteEditor plant={plant} routes={u.out} selfId={u.id} onChange={(r) => onChange(setUnit(plant, u.id, { out: r }))} />
        </div>
      )}
    </div>
  );
}

export function ScreenCard({ plant, u, node, onChange, showRoute = true }: { plant: Plant; u: PlantScreen; node?: PlantNode; onChange: (p: Plant) => void; showRoute?: boolean }) {
  const res = node?.kind === 'screen' ? node.result : undefined;
  const ok = res?.ok ?? true;
  return (
    <div className={`plant-unit screen-unit ${ok ? '' : 'over'}`}>
      <div className="plant-unit-h">
        <span className="unit-kind">Screen</span>
        <input className="unit-name" value={u.name} onChange={(e) => onChange(setUnit(plant, u.id, { name: e.target.value, auto: false }))} />
        <span className={`badge ${ok ? 'ok' : 'over'}`}>{ok ? 'OK' : 'OVERLOADED'}</span>
        <button className="link-btn" onClick={() => onChange(removeUnit(plant, u.id))} aria-label="remove screen">✕</button>
      </div>
      <div className="plant-input">Input: {round(node?.kind === 'screen' ? node.input.tph : 0)} tph</div>
      <div className="field-grid">
        <label>Width (ft)<NumberField value={u.width} min={0} onChange={(v) => onChange(setUnit(plant, u.id, { width: v }))} /></label>
        <label>Length (ft)<NumberField value={u.length} min={0} onChange={(v) => onChange(setUnit(plant, u.id, { length: v }))} /></label>
        <label>Travel (ft/min)<NumberField value={u.travelRate} min={0} onChange={(v) => onChange(setUnit(plant, u.id, { travelRate: v }))} /></label>
        <label>Efficiency (%)<NumberField value={u.targetEfficiency} min={50} max={95} onChange={(v) => onChange(setUnit(plant, u.id, { targetEfficiency: v }))} /></label>
      </div>

      <table className="grad-table plant-deck-table">
        <thead>
          <tr><th>#</th><th>Opening</th><th>Shape</th><th>OA%</th><th>Load</th><th>Bed</th><th /></tr>
        </thead>
        <tbody>
          {u.decks.map((d, di) => {
            const dr = res?.decks[di];
            const load = dr ? (dr.requiredArea / dr.actualArea) * 100 : 0;
            return (
              <tr key={di}>
                <td>{di + 1}</td>
                <td><SieveSelect value={d.aperture} onChange={(v) => onChange(setDeck(plant, u.id, di, { aperture: v }))} /></td>
                <td>
                  <select value={d.openingShape} onChange={(e) => onChange(setDeck(plant, u.id, di, { openingShape: e.target.value as OpeningShape }))}>
                    {OPENING_SHAPES.map((s) => (<option key={s.v} value={s.v}>{s.l}</option>))}
                  </select>
                </td>
                <td><NumberField value={d.openAreaPct} onChange={(v) => onChange(setDeck(plant, u.id, di, { openAreaPct: v }))} /></td>
                <td className={`num ${dr && !dr.adequate ? 'over-limit' : ''}`}>{dr ? `${round(load)}%` : '—'}</td>
                <td className={`num ${dr && !dr.bedDepthOk ? 'over-limit' : ''}`}>{dr ? `${round(dr.bedDepth)}` : '—'}</td>
                <td>{u.decks.length > 1 && <button className="link-btn" onClick={() => onChange(removeDeck(plant, u.id, di))} aria-label="remove deck">✕</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {u.decks.length < 4 && <button className="secondary" onClick={() => onChange(addDeck(plant, u.id))}>+ Add deck</button>}

      {showRoute && (
        <div className="plant-routing">
          <div className="routing-h">Route outputs</div>
          {u.decks.map((d, di) => (
            <div key={di} className="routing-row">
              <span>Deck {di + 1} oversize (+{sieveLabel(d.aperture)})</span>
              <RouteEditor plant={plant} routes={u.deckTargets[di] ?? [{ to: PILE, frac: 1 }]} selfId={u.id} onChange={(r) => onChange(setUnit(plant, u.id, { deckTargets: u.deckTargets.map((x, j) => (j === di ? r : x)) }))} />
            </div>
          ))}
          <div className="routing-row">
            <span>Undersize (−{sieveLabel(u.decks[u.decks.length - 1].aperture)})</span>
            <RouteEditor plant={plant} routes={u.underTarget} selfId={u.id} onChange={(r) => onChange(setUnit(plant, u.id, { underTarget: r }))} />
          </div>
        </div>
      )}
    </div>
  );
}

export function CrusherCard({ plant, u, node, onChange, showRoute = true }: { plant: Plant; u: PlantCrusher; node?: PlantNode; onChange: (p: Plant) => void; showRoute?: boolean }) {
  const cr = node?.kind === 'crusher' ? node : undefined;
  const over = cr?.overCapacity ?? false;
  const type = u.crusherType ?? 'cone';
  const spec = CRUSHER_SPECS[type];
  const feedTop = cr && cr.input.gradation.length ? Math.max(...cr.input.gradation.map((p) => p.size)) : 0;
  const changeType = (t: CrusherType) => onChange(setUnit(plant, u.id, { crusherType: t, css: CRUSHER_SPECS[t].defaultSetting, capacity: CRUSHER_SPECS[t].defaultCapacity }));
  return (
    <div className={`plant-unit crusher-unit ${over ? 'over' : ''}`}>
      <div className="plant-unit-h">
        <span className="unit-kind">Crusher</span>
        <input className="unit-name" value={u.name} onChange={(e) => onChange(setUnit(plant, u.id, { name: e.target.value, auto: false }))} />
        <span className={`badge ${over ? 'over' : 'ok'}`}>{over ? 'OVER CAP' : 'OK'}</span>
        <button className="link-btn" onClick={() => onChange(removeUnit(plant, u.id))} aria-label="remove crusher">✕</button>
      </div>
      <div className="plant-input">Crushes {round(cr?.input.tph ?? 0)} tph · reduction {(cr?.reductionRatio ?? 0).toFixed(1)}:1</div>
      <div className="field-grid">
        <label>
          Type
          <select value={type} onChange={(e) => changeType(e.target.value as CrusherType)}>
            {CRUSHER_TYPE_LIST.map((t) => (<option key={t} value={t}>{CRUSHER_SPECS[t].label}</option>))}
          </select>
        </label>
        <label>
          {spec.settingLabel} (mm)
          <NumberField value={u.css} min={1} step="any" list={`css-${u.id}`} onChange={(v) => onChange(setUnit(plant, u.id, { css: v }))} />
          <datalist id={`css-${u.id}`}>{spec.settings.map((s) => (<option key={s} value={s} />))}</datalist>
        </label>
        <label>Capacity (tph)<NumberField value={u.capacity} min={0} step={10} onChange={(v) => onChange(setUnit(plant, u.id, { capacity: v }))} /></label>
      </div>
      {showRoute && (
        <div className="plant-route">
          <span className="route-label">Crushed goes</span>
          <RouteEditor plant={plant} routes={u.out} selfId={u.id} onChange={(r) => onChange(setUnit(plant, u.id, { out: r }))} />
        </div>
      )}
      {over && <p className="note over-limit">⚠ {round(cr?.input.tph ?? 0)} tph exceeds the {round(u.capacity)} tph capacity {cr && cr.input.tph > u.capacity ? '(includes recirculation)' : ''}.</p>}
      {feedTop > spec.maxFeed && <p className="note over-limit">⚠ Feed top {round(feedTop)} mm exceeds this {spec.label.toLowerCase()}'s {spec.maxFeed} mm max feed.</p>}
      {cr && cr.reductionRatio > spec.reduction[1] + 0.5 && <p className="note over-limit">⚠ Reduction {cr.reductionRatio.toFixed(1)}:1 is above a {spec.label.toLowerCase()}'s typical {spec.reduction[0]}–{spec.reduction[1]}:1.</p>}
    </div>
  );
}

/** Render the right editor card for any unit. */
export function UnitCard({ plant, u, node, onChange, showRoute }: { plant: Plant; u: PlantScreen | PlantCrusher | PlantFeed; node?: PlantNode; onChange: (p: Plant) => void; showRoute?: boolean }) {
  if (u.kind === 'feed') return <FeedCard plant={plant} u={u} onChange={onChange} showRoute={showRoute} />;
  if (u.kind === 'screen') return <ScreenCard plant={plant} u={u} node={node} onChange={onChange} showRoute={showRoute} />;
  return <CrusherCard plant={plant} u={u} node={node} onChange={onChange} showRoute={showRoute} />;
}
