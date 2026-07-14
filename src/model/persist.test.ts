import { describe, it, expect } from 'vitest';
import {
  loadProject, loadLayout, saveProject, saveLayout, clearSaved,
  PROJECT_KEY, LAYOUT_KEY, type Layout,
} from './persist';
import { defaultProject } from '../defaults';

/** Minimal in-memory Storage stand-in. */
function mockStore(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe('auto-save persistence', () => {
  it('round-trips a project through save -> load', () => {
    const store = mockStore();
    const edited = { ...defaultProject, name: 'My Site', feed: { ...defaultProject.feed, tph: 275 } };
    saveProject(edited, store);
    const back = loadProject(store);
    expect(back.name).toBe('My Site');
    expect(back.feed.tph).toBe(275);
  });

  it('falls back to the default when nothing is saved', () => {
    expect(loadProject(mockStore())).toBe(defaultProject);
  });

  it('falls back to the default on corrupt or wrong-shaped data', () => {
    expect(loadProject(mockStore({ [PROJECT_KEY]: '{not json' }))).toBe(defaultProject);
    expect(loadProject(mockStore({ [PROJECT_KEY]: '{"foo":1}' }))).toBe(defaultProject);
    expect(loadProject(mockStore({ [PROJECT_KEY]: 'null' }))).toBe(defaultProject);
  });

  it('round-trips the diagram layout and defaults to empty', () => {
    const store = mockStore();
    const layout: Layout = { feed: { x: 10, y: 20 } };
    saveLayout(layout, store);
    expect(loadLayout(store)).toEqual(layout);
    expect(loadLayout(mockStore())).toEqual({});
    expect(loadLayout(mockStore({ [LAYOUT_KEY]: 'garbage' }))).toEqual({});
  });

  it('clearSaved removes both keys', () => {
    const store = mockStore();
    saveProject(defaultProject, store);
    saveLayout({ feed: { x: 1, y: 2 } }, store);
    clearSaved(store);
    expect(store.getItem(PROJECT_KEY)).toBeNull();
    expect(store.getItem(LAYOUT_KEY)).toBeNull();
  });

  it('never throws when storage is unavailable (private mode / SSR)', () => {
    expect(() => saveProject(defaultProject, undefined)).not.toThrow();
    expect(loadProject(undefined)).toBe(defaultProject);
    expect(() => clearSaved(undefined)).not.toThrow();
  });
});
