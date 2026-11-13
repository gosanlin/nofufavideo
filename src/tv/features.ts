import type { Episode, Meta, Title } from "./types";

/** Retardo de sincronización: pasos de 0,1 s entre -10 y +10 s. */
export function clampSync(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Math.max(-10, Math.min(10, Object.is(r, -0) ? 0 : r));
}

export type ResClass = "4k" | "1080p" | "720p" | "sd";
export function resolutionClass(height: number): ResClass | "" {
  if (!height) return "";
  if (height >= 1800) return "4k";
  if (height >= 1000) return "1080p";
  if (height >= 700) return "720p";
  return "sd";
}
export const RES_LABEL: Record<ResClass, string> = {
  "4k": "4K",
  "1080p": "1080p",
  "720p": "720p",
  sd: "SD",
};

export interface LibFilter {
  genre: string;
  /** orden por nombre: A-Z / Z-A */
  name: "" | "az" | "za";
  /** orden por fecha de estreno: nuevo / viejo */
  date: "" | "new" | "old";
  /** añadidos recientemente primero */
  recent: boolean;
}
export const EMPTY_FILTER: LibFilter = { genre: "", name: "az", date: "", recent: false };

export const yearNum = (t: Title) => {
  const m = String(t.meta?.year ?? "").match(/(19|20)\d{2}/);
  return m ? +m[0] : 0;
};

/** Filtra por género y ordena: añadidos recientes > fecha > nombre (cada uno independiente). */
export function filterTitles(titles: Title[], f: LibFilter, _heights: Record<string, number> = {}): Title[] {
  const out = titles.filter(
    (t) => !f.genre || (t.meta?.genres ?? []).some((g) => g.toLowerCase() === f.genre.toLowerCase()),
  );
  const name = (t: Title) => (t.meta?.title ?? t.name).toLowerCase();
  out.sort((a, b) => {
    if (f.recent && b.added !== a.added) return b.added - a.added;
    if (f.date) {
      const ya = yearNum(a), yb = yearNum(b);
      if (ya !== yb) {
        if (!ya) return 1;
        if (!yb) return -1;
        return f.date === "new" ? yb - ya : ya - yb;
      }
    }
    if (f.name === "za") return name(b).localeCompare(name(a));
    return name(a).localeCompare(name(b));
  });
  return out;
}

export function genresOf(titles: Title[]): string[] {
  const s = new Set<string>();
  titles.forEach((t) => t.meta?.genres.forEach((g) => s.add(g)));
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** ¿Está todo el título visto? */
export function allWatched(eps: Episode[], watched: Record<string, boolean>) {
  return eps.length > 0 && eps.every((e) => watched[e.id]);
}

/* ---------- datos corregidos a mano ("Corregir datos") ---------- */
const OV_KEY = "nofufa-overrides-v1";
export type Overrides = Record<string, Meta>;
export function loadOverrides(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(OV_KEY) ?? "{}");
  } catch {
    return {};
  }
}
export function saveOverride(id: string, m: Meta | null) {
  const o = loadOverrides();
  if (m) o[id] = m;
  else delete o[id];
  localStorage.setItem(OV_KEY, JSON.stringify(o));
}
/** La corrección manual manda sobre la búsqueda automática. */
export function applyOverride(t: Title, o: Overrides): Title {
  const m = o[t.id];
  if (!m) return t;
  return { ...t, meta: m, kind: m.kind && m.kind !== "video" && t.kind !== "movie" ? m.kind : t.kind };
}

/** Momento del scrobble: al pasar el 90 % (una sola vez por reproducción). */
export const shouldScrobble = (t: number, d: number) => d > 60 && t / d >= 0.9;
