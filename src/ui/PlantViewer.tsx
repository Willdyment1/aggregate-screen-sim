import { useMemo, useState, type ReactNode } from 'react';
import type { Deck, OpeningShape } from '../model/types';
import type { Plant, PlantFeed, PlantScreen, PlantUnit, Target, Split, CrusherType } from '../model/plant';
import { PILE, normalizeNames } from '../model/plant';
import { addFeed } from '../model/plantOps';
import { CRUSHER_SPECS, CRUSHER_TYPE_LIST } from '../engine/crusher';
import type { PlantResult } from '../engine/plant';
import { plantMaxFeed, scaleFeeds } from '../engine/plantMaxFeed';
import { sizeAtPassing } from '../engine/gradation';
import { PlantMaxFeedPanel } from './PlantMaxFeed';
import { FeedCard, OPENING_SHAPES } from './unitCards';
import { NumberField } from './NumberField';
import { SieveSelect } from './SieveSelect';
import { InfoTip } from './InfoTip';

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : '—');
const mm = (n: number) => (Number.isFinite(n) ? (n < 1 ? n.toFixed(2) : n.toFixed(1)) : '—');
const fmtArea = (a: number) => (Number.isFinite(a) ? `${a.toFixed(1)} ft²` : '∞');

/** Collapsible section, matching the Simulator results layout; remembers state. */
function Section({ id, title, subtitle, defaultOpen = true, children }: { id: string; title: string; subtitle?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`ass-pvsec-${id}`);
      if (v != null) return v === '1';
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });
  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      try {
        localStorage.setItem(`ass-pvsec-${id}`, n ? '1' : '0');
      } catch {
        /* ignore */
      }
      return n;
    });
  return (
    <div className={`rc ${open ? 'open' : ''}`}>
      <button className="rc-head" onClick={toggle} aria-expanded={open}>
        <span className="rc-caret" aria-hidden>▶</span>
        <span className="rc-title">{title}</span>
        {subtitle && <span className="rc-sub">{subtitle}</span>}
      </button>
      {open && <div className="rc-body">{children}</div>}
    </div>
  );
}

export function PlantViewer({ plant, result, onChange, onEdit }: { plant: Plant; result: PlantResult; onChange: (p: Plant) => void; onEdit: () => void }) {
  const feeds = plant.units.filter((u): u is PlantFeed => u.kind === 'feed');
  const totalFeed = feeds.reduce((s, f) => s + f.tph, 0);
  const screens = result.nodes.filter((n) => n.kind === 'screen');
  const crushers = result.nodes.filter((n) => n.kind === 'crusher');
  const overloaded = screens.filter((s) => s.kind === 'screen' && !s.result.ok).length;
  const overcap = crushers.filter((c) => c.kind === 'crusher' && c.overCapacity).length;
  const productTph = result.piles.reduce((s, p) => s + p.stream.tph, 0);
  const hasUnits = plant.units.some((u) => u.kind !== 'feed');

  // --- editing helpers: every change re-derives auto names + re-simulates upstream ---
  const commit = (next: Plant) => onChange(normalizeNames(next));
  const patchUnit = (id: string, patch: Partial<PlantUnit>) =>
    commit({ ...plant, units: plant.units.map((u) => (u.id === id ? ({ ...u, ...patch } as PlantUnit) : u)) });
  const patchDeck = (id: string, di: number, patch: Partial<Deck>) =>
    commit({
      ...plant,
      units: plant.units.map((u) =>
        u.id === id && u.kind === 'screen' ? { ...u, decks: u.decks.map((d, j) => (j === di ? { ...d, ...patch } : d)) } : u,
      ),
    });
  const unitName = (t: Target) => (t === PILE ? 'product pile' : plant.units.find((u) => u.id === t)?.name ?? '—');
  // "Crusher 19 mm" for a single route, "60% Crusher, 40% pile" for a split.
  const routeLabel = (split?: Split) => {
    const rs = split?.filter((r) => r.frac > 0) ?? [];
    if (!rs.length) return '—';
    if (rs.length === 1) return unitName(rs[0].to);
    const sum = rs.reduce((a, r) => a + r.frac, 0) || 1;
    return rs.map((r) => `${Math.round((100 * r.frac) / sum)}% ${unitName(r.to)}`).join(', ');
  };

  const maxFeed = useMemo(() => plantMaxFeed(plant, result), [plant, result]);

  const statusTone = result.runaway || overloaded || overcap ? 'over' : 'ok';
  const statusText = result.runaway ? '⛔ Runaway' : overloaded || overcap ? '⚠ Warnings' : '✓ OK';
  const statusSub = result.runaway ? 'recycle loop' : [overloaded && `${overloaded} overloaded`, overcap && `${overcap} over cap`].filter(Boolean).join(' · ') || 'all within limits';

  return (
    <section className="panel results plant-viewer">
      <div className="pv-head">
        <h2>Plant overview</h2>
        <button className="secondary" onClick={onEdit}>Add units / wiring on the Plant tab →</button>
      </div>

      {!hasUnits ? (
        <p className="design-intro">
          Your plant is just a feed so far. Go to the <strong>Plant</strong> tab to add screens and crushers —
          all the numbers and results show up here, ready to edit.
        </p>
      ) : (
        <>
          <div className="kpi-strip">
            <div className="kpi kpi-neutral">
              <div className="kpi-label">Feed</div>
              <div className="kpi-value">{round(totalFeed)} tph</div>
              <div className="kpi-sub">{feeds.length > 1 ? `${feeds.length} feeds` : feeds[0]?.name}</div>
            </div>
            <div className="kpi kpi-neutral">
              <div className="kpi-label">Units</div>
              <div className="kpi-value">{plant.units.length - 1}</div>
              <div className="kpi-sub">{screens.length} screen · {crushers.length} crusher</div>
            </div>
            <div className="kpi kpi-ok">
              <div className="kpi-label">Products</div>
              <div className="kpi-value">{round(productTph)} tph</div>
              <div className="kpi-sub">{result.piles.length} piles</div>
            </div>
            <div className={`kpi kpi-${statusTone}`}>
              <div className="kpi-label">Status</div>
              <div className="kpi-value">{statusText}</div>
              <div className="kpi-sub">{statusSub}</div>
            </div>
          </div>

          {result.runaway && (
            <div className="crusher-status fail" role="alert">
              ⛔ A recycle loop is running away — a crusher isn't reducing enough to drain the circuit. Fix it below
              (finer crusher setting) or re-route the loop on the Plant tab.
            </div>
          )}

          <Section
            id="maxfeed"
            title="Max feed & bottleneck"
            subtitle={maxFeed.binding ? `≈ ${round(maxFeed.maxFeedTph)} tph · ${maxFeed.binding.unitName}` : undefined}
            defaultOpen
          >
            <PlantMaxFeedPanel mf={maxFeed} onSetFeed={(v) => onChange(scaleFeeds(plant, v))} />
          </Section>

          <Section
            id="feed"
            title={feeds.length > 1 ? 'Feeds' : 'Feed'}
            subtitle={`${round(totalFeed)} tph${feeds.length > 1 ? ` · ${feeds.length} feeds` : ''}`}
            defaultOpen
          >
            <label className="pv-check pv-realistic">
              <input type="checkbox" checked={plant.realistic} onChange={(e) => commit({ ...plant, realistic: e.target.checked })} />
              Realistic screening <InfoTip text="Model achieved efficiency from bed depth, near-size content and loading (S-curve products) instead of ideal sharp cuts." />
            </label>
            <div className="pv-feed-cards">
              {feeds.map((f) => (
                <FeedCard key={f.id} plant={plant} u={f} onChange={onChange} showRoute={false} />
              ))}
            </div>
            <button className="secondary pv-addfeed" onClick={() => onChange(addFeed(plant).plant)}>+ Add feed</button>
          </Section>

          <Section id="units" title="Units" subtitle={`${screens.length} screen · ${crushers.length} crusher`} defaultOpen>
            <div className="pv-units">
              {result.nodes.map((n) => {
                if (n.kind === 'screen') {
                  const su = plant.units.find((u) => u.id === n.id) as PlantScreen | undefined;
                  return (
                    <div key={n.id} className={`pv-unit ${n.result.ok ? 'ok' : 'over'}`}>
                      <div className="pv-unit-head">
                        <span className="pv-unit-name">{n.name}</span>
                        <span className={`badge ${n.result.ok ? 'ok' : 'over'}`}>{n.result.ok ? 'OK' : 'OVERLOADED'}</span>
                        <span className="pv-unit-in">{round(n.input.tph)} tph in</span>
                      </div>
                      {su && (
                        <div className="pv-edit-grid tight">
                          <label>W (ft)<NumberField min={0} value={su.width} onChange={(v) => patchUnit(su.id, { width: v })} /></label>
                          <label>L (ft)<NumberField min={0} value={su.length} onChange={(v) => patchUnit(su.id, { length: v })} /></label>
                          <label>Travel (fpm)<NumberField min={0} value={su.travelRate} onChange={(v) => patchUnit(su.id, { travelRate: v })} /></label>
                          <label>Target eff. (%)<NumberField min={50} max={99} value={su.targetEfficiency} onChange={(v) => patchUnit(su.id, { targetEfficiency: v })} /></label>
                        </div>
                      )}
                      <div className="deck-cards">
                        {n.result.decks.map((d, i) => (
                          <div key={i} className={`deck-card ${d.adequate ? 'ok' : 'over'}`}>
                            <div className="deck-card-head">
                              <span>Deck {i + 1}{su ? <> → <em>{routeLabel(su.deckTargets[i])}</em></> : null}</span>
                              <span className={`badge ${d.adequate ? 'ok' : 'over'}`}>{d.adequate ? 'ADEQUATE' : 'OVERLOADED'}</span>
                            </div>
                            {su && (
                              <div className="pv-edit-row">
                                <label>Opening<SieveSelect value={su.decks[i]?.aperture ?? d.aperture} onChange={(v) => patchDeck(su.id, i, { aperture: v })} /></label>
                                <label>Shape
                                  <select value={su.decks[i]?.openingShape ?? 'square'} onChange={(e) => patchDeck(su.id, i, { openingShape: e.target.value as OpeningShape })}>
                                    {OPENING_SHAPES.map((s) => (<option key={s.v} value={s.v}>{s.l}</option>))}
                                  </select>
                                </label>
                                <label>Open area %<NumberField min={1} max={90} value={su.decks[i]?.openAreaPct ?? 45} onChange={(v) => patchDeck(su.id, i, { openAreaPct: v })} /></label>
                              </div>
                            )}
                            <dl>
                              <div><dt>Feed to deck</dt><dd>{d.feedTph.toFixed(0)} tph</dd></div>
                              <div><dt>Undersize U <InfoTip text="Tonnage that should pass this deck (finer than the opening) — the numerator in the VSMA area formula." /></dt><dd>{d.undersizeTph.toFixed(0)} tph</dd></div>
                              <div><dt>Required area <InfoTip text="Screening area this deck needs (VSMA formula) for its feed rate, gradation and factors." /></dt><dd>{fmtArea(d.requiredArea)}</dd></div>
                              <div><dt>Actual area</dt><dd>{d.actualArea.toFixed(0)} ft²</dd></div>
                              <div><dt>Load <InfoTip text="Required area ÷ actual area. Under 100% = spare capacity; over 100% = overloaded." /></dt><dd className={d.adequate ? '' : 'over-limit'}>{d.actualArea > 0 ? ((d.requiredArea / d.actualArea) * 100).toFixed(0) : '∞'}%</dd></div>
                              <div><dt>Efficiency <InfoTip text="Design = the target you size to. Achieved = what the deck actually separates given bed depth, near-size and loading — it drives the realistic product curve." /></dt><dd className={d.achievedEfficiency < d.efficiency - 0.5 ? 'over-limit' : ''}>{d.achievedEfficiency < d.efficiency - 0.5 ? `${d.efficiency.toFixed(0)}% → ${d.achievedEfficiency.toFixed(0)}%` : `${d.efficiency.toFixed(0)}%`}</dd></div>
                              <div><dt>Oversize out</dt><dd>{d.overflow.tph.toFixed(0)} tph</dd></div>
                              <div><dt>Bed depth</dt><dd className={d.bedDepthOk ? '' : 'over-limit'}>{d.bedDepth.toFixed(0)} mm{!d.bedDepthOk && <span className="warn" title={`Exceeds ~4× opening (${d.bedDepthLimit.toFixed(0)} mm) — bed too deep`}> ⚠</span>}</dd></div>
                            </dl>
                            <details className="factors">
                              <summary>VSMA factors (÷ = {d.factors.divisor.toFixed(2)})</summary>
                              <div className="factor-grid">
                                <span>A basic cap.</span><span>{d.factors.A_basicCapacity.toFixed(2)}</span>
                                <span>B oversize</span><span>{d.factors.B_oversize.toFixed(2)}</span>
                                <span>C half-size</span><span>{d.factors.C_halfSize.toFixed(2)}</span>
                                <span>D deck loc.</span><span>{d.factors.D_deckLocation.toFixed(2)}</span>
                                <span>E wet screen</span><span>{d.factors.E_wetScreening.toFixed(2)}</span>
                                <span>F mat. weight</span><span>{d.factors.F_materialWeight.toFixed(2)}</span>
                                <span>G open area</span><span>{d.factors.G_openArea.toFixed(2)}</span>
                                <span>H shape</span><span>{d.factors.H_openingShape.toFixed(2)}</span>
                                <span>I efficiency</span><span>{d.factors.I_efficiency.toFixed(2)}</span>
                              </div>
                            </details>
                          </div>
                        ))}
                        {su && (
                          <div className="deck-card ok pv-under-card">
                            <div className="deck-card-head"><span>Undersize → <em>{routeLabel(su.underTarget)}</em></span></div>
                            <p className="pv-under-note">Everything finer than the bottom deck reports here.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                // crusher
                const cu = plant.units.find((u) => u.id === n.id);
                return (
                  <div key={n.id} className={`pv-unit ${n.overCapacity ? 'over' : 'crusher'}`}>
                    <div className="pv-unit-head">
                      <span className="pv-unit-name">{n.name}</span>
                      <span className={`badge ${n.overCapacity ? 'over' : 'ok'}`}>{n.overCapacity ? 'OVER CAP' : 'OK'}</span>
                      <span className="pv-unit-in">{round(n.input.tph)} tph in{cu && cu.kind === 'crusher' ? <> → <em>{routeLabel(cu.out)}</em></> : null}</span>
                    </div>
                    {cu && cu.kind === 'crusher' && (() => {
                      const spec = CRUSHER_SPECS[cu.crusherType ?? 'cone'];
                      return (
                        <div className="pv-edit-grid tight">
                          <label>Type
                            <select value={cu.crusherType ?? 'cone'} onChange={(e) => { const t = e.target.value as CrusherType; patchUnit(cu.id, { crusherType: t, css: CRUSHER_SPECS[t].defaultSetting, capacity: CRUSHER_SPECS[t].defaultCapacity }); }}>
                              {CRUSHER_TYPE_LIST.map((t) => (<option key={t} value={t}>{CRUSHER_SPECS[t].label}</option>))}
                            </select>
                          </label>
                          <label>{spec.settingLabel} (mm)
                            <NumberField min={1} step="any" value={cu.css} list={`pvcss-${cu.id}`} onChange={(v) => patchUnit(cu.id, { css: v })} />
                            <datalist id={`pvcss-${cu.id}`}>{spec.settings.map((s) => (<option key={s} value={s} />))}</datalist>
                          </label>
                          <label>Capacity (tph)<NumberField min={0} value={cu.capacity} onChange={(v) => patchUnit(cu.id, { capacity: v })} /></label>
                        </div>
                      );
                    })()}
                    <dl className="pv-crusher-dl">
                      <div><dt>Throughput</dt><dd className={n.overCapacity ? 'over-limit' : ''}>{round(n.input.tph)} / {round(n.capacity)} tph</dd></div>
                      <div><dt>Reduction</dt><dd>{n.reductionRatio.toFixed(1)}:1</dd></div>
                      <div><dt>Product top</dt><dd>{mm(n.output.gradation.length ? Math.max(...n.output.gradation.map((g) => g.size)) : 0)} mm</dd></div>
                      <div><dt>Product P80</dt><dd>{mm(sizeAtPassing(n.output.gradation, 80))} mm</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section id="piles" title="Product piles" subtitle={`${result.piles.length}`} defaultOpen={false}>
            <div className="mf-table-wrap">
              <table className="products-table">
                <thead>
                  <tr><th>Pile</th><th>tph</th><th>% of feed</th><th>Top</th><th>P80</th></tr>
                </thead>
                <tbody>
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
            </div>
          </Section>
        </>
      )}
    </section>
  );
}
