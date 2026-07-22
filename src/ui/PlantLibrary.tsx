import { useEffect, useState } from 'react';
import type { Plant } from '../model/plant';
import {
  PRESET_PLANTS,
  loadLibrary,
  saveToLibrary,
  deleteFromLibrary,
  renameInLibrary,
  type SavedPlant,
} from '../model/library';

interface Props {
  plant: Plant;
  name: string;
  onLoad: (plant: Plant, name: string) => void;
  onClose: () => void;
}

/** One-line summary of a plant: feed rate + unit counts. */
function summarize(p: Plant): string {
  const feeds = p.units.filter((u) => u.kind === 'feed');
  const tph = feeds.reduce((s, f) => s + (f.kind === 'feed' ? f.tph : 0), 0);
  const screens = p.units.filter((u) => u.kind === 'screen').length;
  const crushers = p.units.filter((u) => u.kind === 'crusher').length;
  const piles = p.units.filter((u) => u.kind === 'pile').length;
  const parts = [
    `${Math.round(tph)} tph feed`,
    screens ? `${screens} screen${screens > 1 ? 's' : ''}` : '',
    crushers ? `${crushers} crusher${crushers > 1 ? 's' : ''}` : '',
    piles ? `${piles} pile${piles > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

export function PlantLibrary({ plant, name, onLoad, onClose }: Props) {
  const [list, setList] = useState<SavedPlant[]>(() => loadLibrary());
  const [saveName, setSaveName] = useState(name);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clash = list.some((e) => e.name.trim().toLowerCase() === saveName.trim().toLowerCase());
  const doSave = () => {
    if (!saveName.trim()) return;
    setList(saveToLibrary(saveName, plant));
  };
  const doDelete = (id: string) => setList(deleteFromLibrary(id));
  const startRename = (e: SavedPlant) => {
    setRenaming(e.id);
    setRenameText(e.name);
  };
  const commitRename = () => {
    if (renaming) setList(renameInLibrary(renaming, renameText));
    setRenaming(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal lib-modal" role="dialog" aria-modal="true" aria-label="Plant library" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Plant library</h2>
          <button className="link-btn" onClick={onClose} aria-label="Close">close ✕</button>
        </div>
        <div className="modal-body">
          <p>
            Load a ready-made system, or save the plant you're working on to your own library. Loading a plant
            <strong> replaces</strong> your current one — save it first if you want to keep it.
          </p>

          <div className="lib-save">
            <input
              className="lib-save-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Name this plant…"
              aria-label="name to save current plant under"
              onKeyDown={(e) => e.key === 'Enter' && doSave()}
            />
            <button className="secondary" onClick={doSave} disabled={!saveName.trim()}>
              {clash ? 'Update in library' : 'Save current plant'}
            </button>
          </div>
          <p className="lib-save-hint">
            Saved in this browser. To share a system with <em>everyone</em>, use <strong>Save JSON</strong> on the
            toolbar and send me the file — I'll add it to the built-in examples below.
          </p>

          <h3>Examples <span className="lib-count">shared · built in</span></h3>
          <ul className="lib-list">
            {PRESET_PLANTS.map((p) => (
              <li key={p.id} className="lib-item">
                <div className="lib-item-main">
                  <div className="lib-item-name">{p.name}</div>
                  <div className="lib-item-sub">{p.description}</div>
                  <div className="lib-item-meta">{summarize(p.build())}</div>
                </div>
                <div className="lib-item-actions">
                  <button className="secondary" onClick={() => onLoad(p.build(), p.name)}>Load</button>
                </div>
              </li>
            ))}
          </ul>

          <h3>My plants <span className="lib-count">{list.length} in this browser</span></h3>
          {list.length === 0 ? (
            <p className="muted">Nothing saved yet. Name the current plant above and hit save.</p>
          ) : (
            <ul className="lib-list">
              {list.map((e) => (
                <li key={e.id} className="lib-item">
                  <div className="lib-item-main">
                    {renaming === e.id ? (
                      <input
                        className="lib-rename"
                        value={renameText}
                        autoFocus
                        onChange={(ev) => setRenameText(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') commitRename();
                          if (ev.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={commitRename}
                      />
                    ) : (
                      <div className="lib-item-name">{e.name}</div>
                    )}
                    <div className="lib-item-meta">{summarize(e.plant)}</div>
                  </div>
                  <div className="lib-item-actions">
                    <button className="secondary" onClick={() => onLoad(e.plant, e.name)}>Load</button>
                    <button className="link-btn" onClick={() => startRename(e)}>Rename</button>
                    <button className="link-btn danger" onClick={() => doDelete(e.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
