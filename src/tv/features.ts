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
  year: string;
  res: "" | ResClass;
  sort: "name" | "year" | "added";
}
export const EMPTY_FILTER: LibFilter = { genre: "", year: "", res: "", sort: "name" };

export const yearNum = (t: Title) => {
  const m = String(t.meta?.year ?? "").match(/(19|20)\d{2}/);
  return m ? +m[0] : 0;
};

export function filterTitles(
  titles: Title[],
  f: LibFilter,
  heights: Record<string, number> = {},
): Title[] {
  const out = titles.filter((t) => {
    if (f.genre && !(t.meta?.genres ?? []).some((g) => g.toLowerCase() === f.genre.toLowerCase()))
      return false;
    if (f.year && String(yearNum(t)) !== f.year) return false;
    if (f.res && resolutionClass(heights[t.id] ?? 0) !== f.res) return false;
    return true;
  });
  const name = (t: Title) => (t.meta?.title ?? t.name).toLowerCase();
  out.sort((a, b) =>
    f.sort === "year"
      ? yearNum(b) - yearNum(a) || name(a).localeCompare(name(b))
      : f.sort === "added"
        ? b.added - a.added
        : name(a).localeCompare(name(b)),
  );
  return out;
}

export function genresOf(titles: Title[]): string[] {
  const s = new Set<string>();
  titles.forEach((t) => t.meta?.genres.forEach((g) => s.add(g)));
  return [...s].sort((a, b) => a.localeCompare(b));
}
export function yearsOf(titles: Title[]): string[] {
  return [...new Set(titles.map(yearNum).filter(Boolean))].sort((a, b) => b - a).map(String);
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
