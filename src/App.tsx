import { useEffect, useMemo, useRef, useState } from 'react';
import { USING_SAMPLE_DATA } from './engine/vsma';
import { GradationPanel } from './ui/GradationPanel';
import { PlantPanel } from './ui/PlantPanel';
import { PlantViewer } from './ui/PlantViewer';
import { Flowsheet } from './ui/Flowsheet';
import { PlantDatasheet } from './ui/PlantDatasheet';
import { loadPlant, savePlant, defaultPlant, examplePlant, normalizeNames, migratePlant, type Plant } from './model/plant';
import { simulatePlant } from './engine/plant';
import { sizeAtPassing, topSize } from './engine/gradation';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { HowItWorks } from './ui/HowItWorks';
import { PlantLibrary } from './ui/PlantLibrary';
import { AmrizeLogo, AmrizeMark } from './ui/AmrizeLogo';
import './App.css';

export default function App() {
  const [view, setView] = useState<'sim' | 'gradation' | 'plant' | 'flow'>('sim');
  // The multi-unit plant is the single source of truth for the whole app; the
  // Gradation / Design / Flowsheet tabs are all derived from it.
  const [plant, setPlant] = useState<Plant>(loadPlant);
  useEffect(() => savePlant(plant), [plant]);
  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem('ass-name') || 'My plant';
    } catch {
      return 'My plant';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ass-name', name);
    } catch {
      /* ignore */
    }
  }, [name]);
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return localStorage.getItem('ass-intro') !== 'off';
    } catch {
      return true;
    }
  });
  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem('ass-intro', 'off');
    } catch {
      /* ignore */
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);

  // --- plant-level undo / redo (covers every unit, number and wiring change) ---
  const past = useRef<Plant[]>([]);
  const future = useRef<Plant[]>([]);
  const burst = useRef<number | undefined>(undefined);
  const [, bumpHist] = useState(0);

  // Every plant edit goes through updatePlant(); rapid edits (typing/dragging a
  // value) coalesce into one undo step via a short idle window.
  const updatePlant = (next: Plant) => {
    if (burst.current === undefined) {
      past.current = [...past.current, plant].slice(-60);
      future.current = [];
      bumpHist((h) => h + 1);
    } else {
      clearTimeout(burst.current);
    }
    burst.current = window.setTimeout(() => {
      burst.current = undefined;
    }, 450);
    setPlant(normalizeNames(next));
  };
  const undo = () => {
    if (past.current.length === 0) return;
    if (burst.current !== undefined) {
      clearTimeout(burst.current);
      burst.current = undefined;
    }
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [plant, ...future.current].slice(0, 60);
    bumpHist((h) => h + 1);
    setPlant(prev);
  };
  const redo = () => {
    if (future.current.length === 0) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, plant].slice(-60);
    bumpHist((h) => h + 1);
    setPlant(next);
  };

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Everything downstream is derived from the plant.
  const plantResult = useMemo(() => simulatePlant(plant), [plant]);

  const [showHelp, setShowHelp] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const loadFromLibrary = (p: Plant, plantName: string) => {
    if (plant.units.length > 1 && !window.confirm(`Load "${plantName}"? This replaces your current plant.`)) return;
    updatePlant(p);
    setName(plantName);
    setShowLibrary(false);
    setView('flow');
  };
  const resetAll = () => {
    if (!window.confirm('Reset the plant back to a single feed? This clears your units and wiring. This cannot be undone.'))
      return;
    updatePlant(defaultPlant());
  };
  const loadExample = () => {
    if (plant.units.length > 1 && !window.confirm('Load the example plant? This replaces your current plant.')) return;
    updatePlant(examplePlant());
    setName('Example plant');
    setView('flow');
  };

  const saveJson = () => {
    const blob = new Blob([JSON.stringify({ name, plant }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_') || 'plant'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    const rows = [['Product', 'tph', '% of feed', 'Top size (mm)', 'P80 (mm)']];
    plantResult.piles.forEach((p) => {
      const g = p.stream.gradation;
      const top = topSize(g);
      const p80 = g.length ? sizeAtPassing(g, 80) : 0;
      rows.push([
        p.product,
        Math.round(p.stream.tph).toString(),
        plantResult.feedTph ? ((p.stream.tph / plantResult.feedTph) * 100).toFixed(1) : '0',
        top.toFixed(1),
        p80.toFixed(1),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_') || 'plant'}_products.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const loadJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const p = data?.plant ?? data; // accept {name, plant} or a bare plant
        if (p && Array.isArray(p.units) && p.units.some((u: { kind: string }) => u.kind === 'feed')) {
          updatePlant(migratePlant(p));
          if (typeof data?.name === 'string') setName(data.name);
        } else {
          alert('That file is not a plant (expected a units list with a feed).');
        }
      } catch {
        alert('Could not parse that file as a plant JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app">
      <div className="print-only">
        <ErrorBoundary label="The datasheet">
          <PlantDatasheet plant={plant} result={plantResult} name={name} date={new Date().toLocaleDateString()} />
        </ErrorBoundary>
      </div>

      <div className="brand-bar">
        <a className="brand-lockup" href="https://www.amrize.com" target="_blank" rel="noopener noreferrer" aria-label="Amrize">
          <AmrizeLogo className="brand-logo" />
        </a>
        <span className="brand-tagline">Building North America</span>
      </div>

      <header className="app-header">
        <div>
          <h1><AmrizeMark className="title-mark" title="" aria-hidden="true" />Aggregate Screening Simulator</h1>
          <p className="subtitle">VSMA factor method · sizing + product simulation</p>
          <p className="units-legend">Sizes in mm · screen in ft · feed rate in tph</p>
        </div>
        <div className="toolbar">
          <button className="secondary" onClick={() => setShowLibrary(true)} title="Load a saved system or save this one">
            ⛁ Library
          </button>
          <button className="secondary" onClick={() => setShowHelp(true)} title="How it works / method">
            ⓘ How it works
          </button>
          <button className="secondary" onClick={undo} disabled={past.current.length === 0} title="Undo">
            ↶ Undo
          </button>
          <button className="secondary" onClick={redo} disabled={future.current.length === 0} title="Redo">
            ↷ Redo
          </button>
          <input
            className="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="plant name"
          />
          <button className="secondary" onClick={saveJson}>
            Save JSON
          </button>
          <button className="secondary" onClick={() => fileInput.current?.click()}>
            Load JSON
          </button>
          <button className="secondary" onClick={() => window.print()}>
            Export PDF
          </button>
          <button className="secondary" onClick={exportCsv} title="Download the product piles as CSV">
            Products CSV
          </button>
          <button
            className="secondary danger"
            onClick={resetAll}
            title="Reset the plant back to a single feed"
          >
            ↺ Reset
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])}
          />
          <span className="autosave" title="Your work is saved in this browser automatically">
            ✓ Auto-saved
          </span>
        </div>
      </header>

      {USING_SAMPLE_DATA && (
        <div className="sample-banner" role="alert">
          ⚠️ <strong>Sample coefficient data.</strong> Results use placeholder VSMA factors, not the
          real Handbook values.
        </div>
      )}

      {showIntro && (
        <div className="intro">
          <button className="intro-x" onClick={dismissIntro} aria-label="Dismiss">
            ✕
          </button>
          <strong>New here?</strong> Try the <button className="link-inline" onClick={loadExample}>example plant</button> to
          see it in action, or build your own on the <em>Plant</em> or <em>Flowsheet</em> tab. Everything else — the
          <em>Simulator</em> overview and the <em>Gradation</em> curves — updates automatically from it.
        </div>
      )}

      {showHelp && <HowItWorks onClose={() => setShowHelp(false)} />}
      {showLibrary && <PlantLibrary plant={plant} name={name} onLoad={loadFromLibrary} onClose={() => setShowLibrary(false)} />}

      <nav className="tabs">
        <button className={view === 'sim' ? 'tab active' : 'tab'} onClick={() => setView('sim')}>
          Simulator
        </button>
        <button className={view === 'plant' ? 'tab active' : 'tab'} onClick={() => setView('plant')}>
          Plant
        </button>
        <button className={view === 'gradation' ? 'tab active' : 'tab'} onClick={() => setView('gradation')}>
          Gradation
        </button>
        <button className={view === 'flow' ? 'tab active' : 'tab'} onClick={() => setView('flow')}>
          Flowsheet
        </button>
      </nav>

      {view === 'gradation' ? (
        <main>
          <ErrorBoundary label="The gradation tab">
            <GradationPanel plant={plant} result={plantResult} />
          </ErrorBoundary>
        </main>
      ) : view === 'plant' ? (
        <main>
          <ErrorBoundary label="The plant tab">
            <PlantPanel plant={plant} result={plantResult} onChange={updatePlant} />
          </ErrorBoundary>
        </main>
      ) : view === 'flow' ? (
        <main>
          <section className="panel flowsheet">
            <div className="pv-head">
              <h2>Flowsheet</h2>
              <span className="fs-subtitle">Build visually — drag, wire and edit. In sync with the Plant tab.</span>
            </div>
            <ErrorBoundary label="The flowsheet">
              <Flowsheet plant={plant} result={plantResult} onChange={updatePlant} />
            </ErrorBoundary>
          </section>
        </main>
      ) : (
        <main>
          <ErrorBoundary label="The plant overview">
            <PlantViewer plant={plant} result={plantResult} onChange={updatePlant} onEdit={() => setView('plant')} />
          </ErrorBoundary>
        </main>
      )}

      <footer className="app-footer">
        <div className="footer-brand">
          <AmrizeMark className="footer-mark" title="Amrize" />
          <AmrizeLogo className="footer-logo" title="Amrize" />
        </div>
        <p>
          VSMA 9-factor method (validated against the Handbook example: 48 / 93 / 111 ft²). The <strong>Plant</strong> tab
          is the source of truth — every other tab is derived from it.
        </p>
        <p className="brand-disclaimer">
          Independent engineering demo styled in the Amrize brand for portfolio purposes — not affiliated with or
          endorsed by Amrize.
        </p>
      </footer>
    </div>
  );
}
