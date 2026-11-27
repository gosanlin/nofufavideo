import type { Title, Episode } from "./types";
import { sortDubs, type Dub } from "./dubs";
import { hash } from "./library";

export const VERHORA_BASE = "https://verhoradeaventura.online";
export const VERHORA_JSON = `${import.meta.env?.BASE_URL ?? "./"}verhora.json`;

const DUB_ORDER = ["LAT", "ESP", "DUAL", "ENG", "JAP", "VOSE"];
function rank(l: string) { const i = DUB_ORDER.indexOf(l); return i < 0 ? 99 : i; }
function sortDubsLocal(d: Dub[]) { return [...d].sort((a, b) => rank(a.lang) - rank(b.lang) || a.lang.localeCompare(b.lang)); }

/** Decodifica el formato serializado de Astro (islas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function astroDecode(v: any): any {
  if (Array.isArray(v)) {
    if (v.length === 2 && typeof v[0] === "number" && v[0] >= 0 && v[0] <= 11) {
      const code = v[0];
      if (code === 0) return astroDecode(v[1]);
      if (code === 1) return v[1].map(astroDecode);
      if (code === 2) return new RegExp(v[1]);
      if (code === 3) return new Date(v[1]);
      if (code === 4) return new Map(v[1].map(astroDecode));
      if (code === 5) return new Set(v[1].map(astroDecode));
      if (code === 6) return BigInt(v[1]);
      if (code === 7) return new URL(v[1]);
      if (code === 8) return new Uint8Array(v[1]);
      if (code === 9) return new Uint16Array(v[1]);
      if (code === 10) return new Uint32Array(v[1]);
      if (code === 11) return Infinity * v[1];
    }
    return v.map(astroDecode);
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = astroDecode(v[k]);
    return out;
  }
  return v;
}

function unescapeHtml(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Extrae el reproductor (Videoplayer) de una pAgina de episodio. */
export function parseVerHoraEpisodeHtml(html: string): {
  key: string;
  title: { LAT: string; ESP: string };
  sources: Record<string, string[]>;
  lulu: Record<string, string>;
  servers: Record<string, string[]>;
} | null {
  for (const m of html.matchAll(/<astro-island[^>]*props="([^"]*)"/g)) {
    try {
      const props = astroDecode(JSON.parse(unescapeHtml(m[1]))) as Record<string, unknown>;
      if (props && props.sources) {
        const sources = props.sources as Record<string, string[]>;
        const lulu: Record<string, string> = {};
        const servers: Record<string, string[]> = {};
        for (const lang of Object.keys(sources)) {
          const urls = (sources[lang] || []).filter(Boolean);
          servers[lang] = urls;
          const found = urls.find((u) => /luluvid\.com\/e\//i.test(u));
          if (found) lulu[lang] = found;
          else if (urls[0]) lulu[lang] = urls[0];
        }
        return {
          key: String(props.episodeKey ?? ""),
          title: (props.title as { LAT: string; ESP: string }) ?? { LAT: "", ESP: "" },
          sources,
          lulu,
          servers,
        };
      }
    } catch { /* siguiente */ }
  }
  return null;
}

/** Extrae las URLs de episodios de una pAgina de indice. */
export function parseVerHoraIndexHtml(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<astro-island[^>]*props="([^"]*)"/g)) {
    try {
      const props = astroDecode(JSON.parse(unescapeHtml(m[1])));
      // collect url fields
      const walk = (o: unknown) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        const rec = o as Record<string, unknown>;
        if (typeof rec.url === "string" && rec.url.startsWith("/ver/")) out.add(rec.url);
        for (const k of Object.keys(rec)) walk(rec[k]);
      };
      walk(props);
    } catch { /* */ }
  }
  for (const m of html.matchAll(/href="(\/ver\/[^"]+)"/g)) out.add(m[1]);
  return [...out].filter((u) => /\/ver\/(\d{2}x\d{2}|.+\/\d{2}x\d{2}|.+\/\d{2})$/i.test(u));
}

/** Convierte datos scrapeados (raw) a Title[]. */
export function titlesFromVerHoraRaw(raw: unknown[]): Title[] {
  const DUB_ORDER_LOCAL = DUB_ORDER;
  const groups = new Map<string, { e: Record<string, unknown>; season: number; number: number }[]>();
  for (const item of raw as Record<string, unknown>[]) {
    let series = "Hora de Aventura";
    let season = 0;
    let number = 0;
    const url = String(item.url ?? "");
    let m = url.match(/^\/ver\/(\d{2})x(\d{2})$/);
    if (m) { series = "Hora de Aventura"; season = +m[1]; number = +m[2]; }
    else if (url.startsWith("/ver/fionna-y-cake/")) { series = "Hora de Aventura: Fionna y Cake"; m = url.match(/\/(\d{2})x(\d{2})$/)!; season = +m[1]; number = +m[2]; }
    else if (url.startsWith("/ver/tierras-lejanas/")) { series = "Hora de Aventura: Tierras Lejanas"; m = url.match(/\/(\d{2})x(\d{2})$/)!; season = +m[1]; number = +m[2]; }
    else if (url.startsWith("/ver/misiones-secundarias/")) { series = "Hora de Aventura: Misiones Secundarias"; m = url.match(/\/(\d{2})x(\d{2})$/)!; season = +m[1]; number = +m[2]; }
    else if (url.startsWith("/ver/graybles-de-todo-tipo/")) { series = "Hora de Aventura"; season = 0; number = +url.match(/\/(\d{2})$/)?.[1] || 0; }
    else if (url.startsWith("/ver/estaciones-rana/")) { series = "Hora de Aventura"; season = 0; number = 100 + (+url.match(/\/(\d{2})$/)?.[1] || 0); }
    else continue;
    if (!groups.has(series)) groups.set(series, []);
    groups.get(series)!.push({ e: item, season, number });
  }
  const titles: Title[] = [];
  for (const [series, items] of groups) {
    const episodes: Episode[] = items.map(({ e, season, number }) => {
      const sources = (e.sources as Record<string, string[]>) ?? (e.servers as Record<string, string[]>) ?? {};
      const lulu = (e.lulu as Record<string, string>) ?? {};
      const langs = new Set([...Object.keys(sources), ...Object.keys(lulu)]);
      const dubs: Dub[] = sortDubsLocal(
        [...langs]
          .map((lang) => {
            const urls = (Array.isArray(sources[lang]) && sources[lang].length
              ? sources[lang]
              : lulu[lang]
                ? [lulu[lang]]
                : []) as string[];
            const clean = urls.filter(Boolean);
            if (!clean.length) return null;
            const primary = clean.find((u) => /luluvid\.com\/e\//i.test(u)) || clean[0];
            return { lang, url: primary, servers: clean, mirrors: clean };
          })
          .filter((d): d is Dub => !!d),
      );
      const titleObj = e.title as { LAT?: string; ESP?: string };
      return {
        id: hash(series + "/" + String(e.key)),
        titleId: "verhora-" + series.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: titleObj?.LAT || titleObj?.ESP || String(e.key),
        season,
        number,
        url: dubs.length ? dubs[0].url : ((Object.values(lulu)[0] as string) || (Object.values(sources)[0]?.[0] as string)),
        ...(dubs.length ? { dubs } : {}),
        servers: [...new Set(dubs.flatMap((d) => d.servers ?? []))],
        mirrors: [...new Set(dubs.flatMap((d) => d.mirrors ?? []))],
        added: Date.now(),
      };
    });
    episodes.sort((a, b) => a.season - b.season || a.number - b.number);
    titles.push({
      id: "verhora-" + series.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: series,
      kind: episodes.length > 1 ? "series" : "movie",
      episodes,
      added: Date.now(),
    });
  }
  return titles;
}

/** Carga el catAlogo pre-scrapeado (public/verhora.json). */
export async function loadVerHora(fresh = false): Promise<Title[]> {
  try {
    const r = await fetch(`${VERHORA_JSON}${fresh ? `?v=${Date.now()}` : ""}`, { cache: fresh ? "no-store" : "default" });
    if (!r.ok) throw new Error("no verhora.json");
    const j = await r.json();
    if (Array.isArray(j)) return j as Title[];
    if (j && Array.isArray(j.titles)) return j.titles as Title[];
    return [];
  } catch {
    return [];
  }
}

/** Alias y helpers esperados por pruebas. */
export const fromVerHora = loadVerHora;
export const fetchVerHora = loadVerHora;
export const titlesFromVerHora = (data: unknown): Title[] => {
  if (Array.isArray(data) && data.length && (data[0] as Title)?.episodes) return data as Title[];
  if (Array.isArray(data)) return titlesFromVerHoraRaw(data);
  return [];
};

/** Scraper completo en navegador (mejor esfuerzo; puede fallar por CORS). */
export async function scrapeVerHora(): Promise<Title[]> {
  const urls: string[] = [];
  try {
    for (const path of ["/", "/ver/fionna-y-cake", "/ver/tierras-lejanas", "/ver/misiones-secundarias"]) {
      const r = await fetch(VERHORA_BASE + path);
      const html = await r.text();
      urls.push(...parseVerHoraIndexHtml(html));
    }
  } catch { /* */ }
  const uniq = [...new Set(urls)];
  const raw: Record<string, unknown>[] = [];
  for (const u of uniq) {
    try {
      const r = await fetch(VERHORA_BASE + u);
      const html = await r.text();
      const p = parseVerHoraEpisodeHtml(html);
      if (p) raw.push({ url: u, key: p.key, title: p.title, lulu: p.lulu, sources: p.sources, servers: p.servers });
    } catch { /* */ }
  }
  return titlesFromVerHoraRaw(raw);
}
