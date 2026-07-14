// Auto-save: persist the working project + diagram layout to a Storage
// (localStorage in the app) so a refresh or dropped session never loses work.
// Pure and storage-injectable so it can be unit-tested without a browser.
import type { Project } from './types';
import { defaultProject } from '../defaults';

export const PROJECT_KEY = 'ass-project';
export const LAYOUT_KEY = 'ass-layout';

export type Layout = Record<string, { x: number; y: number }>;

/** The browser localStorage, or undefined in a non-DOM context (SSR/tests). */
function defaultStore(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** A project is only accepted if its core shape is intact. */
function looksLikeProject(p: unknown): p is Project {
  const o = p as Project | null;
  return !!o && !!o.feed?.gradation && Array.isArray(o.screen?.decks);
}

/** Restore the saved project, falling back to the default on missing/corrupt data. */
export function loadProject(store: Storage | undefined = defaultStore()): Project {
  try {
    const raw = store?.getItem(PROJECT_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (looksLikeProject(p)) return p;
    }
  } catch {
    /* ignore */
  }
  return defaultProject;
}

/** Restore the saved diagram layout, or an empty map. */
export function loadLayout(store: Storage | undefined = defaultStore()): Layout {
  try {
    const raw = store?.getItem(LAYOUT_KEY);
    const l = raw ? JSON.parse(raw) : null;
    if (l && typeof l === 'object') return l as Layout;
  } catch {
    /* ignore */
  }
  return {};
}

/** Persist the project (best-effort — quota/private-mode failures are ignored). */
export function saveProject(project: Project, store: Storage | undefined = defaultStore()): void {
  try {
    store?.setItem(PROJECT_KEY, JSON.stringify(project));
  } catch {
    /* ignore */
  }
}

/** Persist the diagram layout (best-effort). */
export function saveLayout(layout: Layout, store: Storage | undefined = defaultStore()): void {
  try {
    store?.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

/** Clear all saved state (used by Reset). */
export function clearSaved(store: Storage | undefined = defaultStore()): void {
  try {
    store?.removeItem(PROJECT_KEY);
    store?.removeItem(LAYOUT_KEY);
  } catch {
    /* ignore */
  }
}
