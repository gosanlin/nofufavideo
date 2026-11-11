import { useCallback, useEffect, useState } from "react";

export interface Progress {
  t: number;
  d: number;
  at: number;
  titleId: string;
}
export interface State {
  progress: Record<string, Progress>; // por episodio
  watched: Record<string, boolean>;
  hiddenContinue: Record<string, number>; // titleId -> fecha en que se quitó
  watchlist: string[];
  /** historial de visto: más reciente primero, una entrada por episodio */
  history: HistoryEntry[];
  rating: Record<string, 1 | -1>;
  /** retardo de subtítulos/audio por episodio (segundos) */
  sync: Record<string, { sub?: number; audio?: number }>;
  prefs: Record<string, { audio?: string | undefined; sub?: string | undefined; at?: number }>; // por título
  settings: {
    skipIntro: boolean;
    autoplayNext: boolean;
    audioLang: string;
    subLang: string;
    showWatermark: boolean;
    /** cuándo se cambió por última vez el idioma de audio/subtítulos en Ajustes */
    langAt?: number;
    tvMode: boolean;
    nightMode: boolean;
    speed: number;
    /** no guardar progreso ni historial */
    pauseHistory: boolean;
    /** mostrar la fila "Seguir viendo" en Inicio */
    showContinue: boolean;
    /** máximo de títulos en "Seguir viendo" */
    continueLimit: number;
    /** % a partir del cual un episodio cuenta como visto */
    doneAt: number;
    /** segundos antes del final para mostrar "Siguiente episodio" */
    nextAt: number;
    /** al abrir un título, reanudar donde se dejó */
    resume: boolean;
  };
}

export interface HistoryEntry {
  epId: string;
  titleId: string;
  at: number;
  t: number;
  d: number;
}
export const HISTORY_MAX = 500;

/** Inserta/actualiza la entrada de un episodio al principio del historial. */
export function pushHistory(h: HistoryEntry[], e: HistoryEntry): HistoryEntry[] {
  return [e, ...h.filter((x) => x.epId !== e.epId)].slice(0, HISTORY_MAX);
}

/**
 * Idiomas a usar en un título: lo elegido en el reproductor para ese título manda,
 * salvo que después se haya cambiado el idioma en Ajustes.
 */
export function langPrefs(s: State, titleId: string): { audio: string; sub: string } {
  const p = s.prefs[titleId];
  const fresh = !!p && (p.at ?? 0) > (s.settings.langAt ?? 0);
  return {
    audio: (fresh && p!.audio) || s.settings.audioLang,
    sub: fresh && p!.sub !== undefined ? p!.sub : s.settings.subLang,
  };
}

const KEY = "nofufa-state-v2";
const empty: State = {
  progress: {},
  watched: {},
  hiddenContinue: {},
  watchlist: [],
  history: [],
  rating: {},
  prefs: {},
  sync: {},
  settings: {
    skipIntro: false,
    autoplayNext: true,
    audioLang: "spa",
    subLang: "",
    showWatermark: true,
    tvMode: false,
    nightMode: false,
    speed: 1,
    pauseHistory: false,
    showContinue: true,
    continueLimit: 20,
    doneAt: 92,
    nextAt: 20,
    resume: true,
  },
};
export const DEFAULT_SETTINGS = empty.settings;

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return s ? { ...empty, ...s, settings: { ...empty.settings, ...s.settings } } : empty;
  } catch {
    return empty;
  }
}

let state: State = empty;
let loaded = false;
const subs = new Set<() => void>();
let saveT = 0;

export function getState() {
  if (!loaded && typeof window !== "undefined") {
    state = load();
    loaded = true;
  }
  return state;
}
export function update(fn: (s: State) => State) {
  state = fn(getState());
  subs.forEach((f) => f());
  window.clearTimeout(saveT);
  saveT = window.setTimeout(() => localStorage.setItem(KEY, JSON.stringify(state)), 300);
}

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return getState();
}

export const actions = {
  setProgress: (epId: string, titleId: string, t: number, d: number) =>
    update((s) => {
      if (s.settings.pauseHistory) return s;
      const done = d > 0 && (t / d) * 100 >= s.settings.doneAt;
      const progress = { ...s.progress };
      if (done) delete progress[epId];
      else progress[epId] = { t, d, at: Date.now(), titleId };
      const hidden = { ...s.hiddenContinue };
      delete hidden[titleId];
      return {
        ...s,
        progress,
        hiddenContinue: hidden,
        watched: done ? { ...s.watched, [epId]: true } : s.watched,
        history: pushHistory(s.history ?? [], { epId, titleId, at: Date.now(), t, d }),
      };
    }),
  setWatched: (ids: string[], on: boolean) =>
    update((s) => {
      const watched = { ...s.watched },
        progress = { ...s.progress };
      for (const id of ids) {
        if (on) {
          watched[id] = true;
          delete progress[id];
        } else delete watched[id];
      }
      return { ...s, watched, progress };
    }),
  removeContinue: (titleId: string) =>
    update((s) => ({ ...s, hiddenContinue: { ...s.hiddenContinue, [titleId]: Date.now() } })),
  toggleWatchlist: (id: string) =>
    update((s) => ({
      ...s,
      watchlist: s.watchlist.includes(id)
        ? s.watchlist.filter((x) => x !== id)
        : [id, ...s.watchlist],
    })),
  rate: (id: string, v: 1 | -1) =>
    update((s) => {
      const rating = { ...s.rating };
      if (rating[id] === v) delete rating[id];
      else rating[id] = v;
      return { ...s, rating };
    }),
  setPref: (titleId: string, p: { audio?: string | undefined; sub?: string | undefined }) =>
    update((s) => ({ ...s, prefs: { ...s.prefs, [titleId]: { ...s.prefs[titleId], ...p, at: Date.now() } } })),
  setSettings: (p: Partial<State["settings"]>) =>
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        ...p,
        ...("audioLang" in p || "subLang" in p ? { langAt: Date.now() } : {}),
      },
    })),
  setSync: (epId: string, p: { sub?: number; audio?: number }) =>
    update((s) => ({ ...s, sync: { ...s.sync, [epId]: { ...s.sync[epId], ...p } } })),
  clearHistory: () =>
    update((s) => ({ ...s, progress: {}, watched: {}, hiddenContinue: {}, history: [] })),
  removeHistory: (epIds: string[]) =>
    update((s) => ({ ...s, history: s.history.filter((h) => !epIds.includes(h.epId)) })),
  clearContinue: (titleIds: string[]) =>
    update((s) => {
      const hidden = { ...s.hiddenContinue };
      for (const id of titleIds) hidden[id] = Date.now();
      return { ...s, hiddenContinue: hidden };
    }),
  resetSettings: () => update((s) => ({ ...s, settings: { ...empty.settings, langAt: Date.now() } })),
  clearWatchlist: () => update((s) => ({ ...s, watchlist: [], rating: {} })),
  exportData: () => JSON.stringify({ app: "nofufa", v: 2, state: getState() }, null, 2),
  importData: (json: string) => {
    const o = JSON.parse(json);
    const st = o?.state ?? o;
    if (!st || typeof st !== "object" || !("settings" in st)) throw new Error("Archivo no válido");
    update(() => ({ ...empty, ...st, settings: { ...empty.settings, ...st.settings } }));
  },
};

export function useInterval(fn: () => void, ms: number) {
  const cb = useCallback(fn, [fn]);
  useEffect(() => {
    const i = setInterval(cb, ms);
    return () => clearInterval(i);
  }, [cb, ms]);
}
