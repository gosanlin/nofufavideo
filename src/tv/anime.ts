import type { Title } from "./types";
import { buildTitle, hash } from "./library";

/* ============================================================
 *  AnimeOnline scrapers (veranimeonline.co, animedlatino.com, jkanime.net)
 *  Diseñado para ejecutarse en GitHub Actions (Node.js) y generar
 *  public/anime.json. Los datos se cargan en la app como otro catálogo.
 * ============================================================ */

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

/** Fetcheo con timeout y user-agent. */
async function fetchText(url: string, ms = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const r = await fetch(url, { headers: UA, signal: ctrl.signal, cache: "no-store" });
  clearTimeout(t);
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.text();
}

/** Limpia slug de URL para usarlo como id. */
function slugId(url: string): string {
  return hash(url);
}

/** Normaliza nombre de episodio a "T{season} E{number}". */
function epName(season: number, number: number, fallback?: string): string {
  return fallback?.trim() ? fallback : `Episodio ${number}`;
}

/* ------------------------------------------------------------------ */
/*  vereanimeonline.co                                                */
/* ------------------------------------------------------------------ */

export const ANIMEONLINE_BASE = "https://veranimeonline.co";
export const ANIMEONLINE_JSON = `${import.meta.env?.BASE_URL ?? "./"}anime.json`;

function parseAnimeOnlineIndex(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(https:\/\/veranimeonline\.co\/anime\/[^"\/]+(?:\/[^"\/]*)?)" /g)) {
    out.add(m[1]);
  }
  // también sin espacio final
  for (const m of html.matchAll(/href="(https:\/\/veranimeonline\.co\/anime\/[^"\/]+(?:\/[^"\/]*)?)"/g)) {
    out.add(m[1]);
  }
  return [...out];
}

function parseAnimeOnlinePagination(html: string): number {
  let max = 1;
  for (const m of html.matchAll(/\/anime\/page\/(\d+)\//g)) {
    const n = +m[1];
    if (n > max) max = n;
  }
  return max;
}

function parseAnimeOnlineDetail(html: string): {
  title: string;
  poster?: string;
  episodes: { season: number; number: number; name: string; url: string }[];
} | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\|.*$/i, "").trim() : "Anime";
  const posterMatch = html.match(/<img[^>]+src="([^"]+)"/i);
  const poster = posterMatch ? posterMatch[1] : undefined;

  const episodes: { season: number; number: number; name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /href="(https:\/\/veranimeonline\.co\/episodio\/[^"\/]+-episodio-(\d+)\/)"/gi
  )) {
    const url = m[1];
    const num = +m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    episodes.push({ season: 1, number: num, name: `Episodio ${num}`, url });
  }
  episodes.sort((a, b) => a.number - b.number);
  if (!title || !episodes.length) return null;
  return { title, poster, episodes };
}

/* ------------------------------------------------------------------ */
/*  animedlatino.com                                                  */
/* ------------------------------------------------------------------ */

export const ANIMEDLATINO_BASE = "https://animedlatino.com";

function parseAnimeDLatinoIndex(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(https:\/\/animedlatino\.com\/serie\/[^"\/]+)" /g)) {
    out.add(m[1]);
  }
  for (const m of html.matchAll(/href="(https:\/\/animedlatino\.com\/serie\/[^"\/]+)"/g)) {
    out.add(m[1]);
  }
  return [...out];
}

function parseAnimeDLatinoPagination(html: string): number {
  let max = 1;
  for (const m of html.matchAll(/\/tipo\/serie(?:\/pagina)?\/(\d+)/g)) {
    const n = +m[1];
    if (n > max) max = n;
  }
  return max;
}

function parseAnimeDLatinoDetail(html: string): {
  title: string;
  poster?: string;
  episodes: { season: number; number: number; name: string; url: string }[];
} | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\|.*$/i, "").trim() : "Anime";
  const posterMatch = html.match(/<img[^>]+src="([^"]+)"/i);
  const poster = posterMatch ? posterMatch[1] : undefined;

  const episodes: { season: number; number: number; name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /href="(https:\/\/animedlatino\.com\/ver\/[^"\/]+\/(\d+)x(\d+)\/)"/gi
  )) {
    const url = m[1];
    const season = +m[2];
    const number = +m[3];
    if (seen.has(url)) continue;
    seen.add(url);
    episodes.push({ season, number, name: `T${season} E${number}`, url });
  }
  episodes.sort((a, b) => a.season - b.season || a.number - b.number);
  if (!title || !episodes.length) return null;
  return { title, poster, episodes };
}

/* ------------------------------------------------------------------ */
/*  jkanime.net                                                       */
/* ------------------------------------------------------------------ */

export const JKANIME_BASE = "https://jkanime.net";

function parseJkAnimeIndex(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(https:\/\/jkanime\.net\/[a-z0-9\-]+\/?)" /g)) {
    out.add(m[1].replace(/\/$/, ""));
  }
  for (const m of html.matchAll(/href="(https:\/\/jkanime\.net\/[a-z0-9\-]+\/?)"/g)) {
    out.add(m[1].replace(/\/$/, ""));
  }
  // filtrar no-series
  const filtered = [...out].filter(
    (u) =>
      !/^(https:\/\/jkanime\.net)(|(\/dash)|(\/usuario)|(\/guardado)|(\/historial)|(\/notificaciones))$/i.test(u)
  );
  return filtered;
}

function parseJkAnimeDetail(html: string): {
  title: string;
  poster?: string;
  episodes: { season: number; number: number; name: string; url: string }[];
} | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch ? titleMatch[1].replace(/—.*$/i, "").replace(/\|.*$/i, "").trim() : "Anime";
  title = title.replace(/Sub Español Online gratis.*$/i, "").trim();
  const posterMatch = html.match(/<img[^>]+src="([^"]+)"/i);
  const poster = posterMatch ? posterMatch[1] : undefined;

  const episodes: { season: number; number: number; name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href="(https:\/\/jkanime\.net\/[a-z0-9\-]+\/(\d+)\/?)" /gi)) {
    const url = m[1].replace(/\/$/, "");
    const number = +m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    episodes.push({ season: 1, number, name: `Episodio ${number}`, url });
  }
  for (const m of html.matchAll(/href="(https:\/\/jkanime\.net\/[a-z0-9\-]+\/(\d+)\/?)"/gi)) {
    const url = m[1].replace(/\/$/, "");
    const number = +m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    episodes.push({ season: 1, number, name: `Episodio ${number}`, url });
  }
  episodes.sort((a, b) => a.number - b.number);
  if (!title || !episodes.length) return null;
  return { title, poster, episodes };
}

/* ------------------------------------------------------------------ */
/*  Conversión a Title[]                                              */
/* ------------------------------------------------------------------ */

function detailToTitle(
  source: string,
  baseId: string,
  d: {
    title: string;
    poster?: string;
    episodes: { season: number; number: number; name: string; url: string }[];
  },
  kind: "anime"
): Title {
  const files = d.episodes.map((e, i) => ({
    rel: `${d.title} T${e.season}E${e.number}`,
    name: e.name,
    url: e.url,
    servers: [e.url],
    mirrors: [e.url],
  }));
  return buildTitle({
    id: `${source}-${hash(baseId + d.title)}`,
    name: d.title,
    kindHint: kind,
    files,
    images: d.poster ? { poster: d.poster, background: d.poster } : undefined,
  });
}

/* ------------------------------------------------------------------ */
/*  Scrapers principales (para ejecutar en Node.js / GitHub Actions)  */
/* ------------------------------------------------------------------ */

export async function scrapeAnimeOnline(maxPages = 10): Promise<Title[]> {
  const titles: Title[] = [];
  for (let p = 1; p <= maxPages; p++) {
    const url = p === 1 ? `${ANIMEONLINE_BASE}/anime/` : `${ANIMEONLINE_BASE}/anime/page/${p}/`;
    try {
      const html = await fetchText(url);
      const links = parseAnimeOnlineIndex(html);
      if (!links.length) break;
      for (const link of links) {
        try {
          const dh = await fetchText(link);
          const d = parseAnimeOnlineDetail(dh);
          if (d) titles.push(detailToTitle("animeonline", link, d, "anime"));
        } catch {
          /* siguiente */
        }
      }
      const total = parseAnimeOnlinePagination(html);
      if (p >= total) break;
    } catch {
      break;
    }
  }
  return titles;
}

export async function scrapeAnimeDLatino(maxPages = 20): Promise<Title[]> {
  const titles: Title[] = [];
  for (let p = 1; p <= maxPages; p++) {
    const url = p === 1 ? `${ANIMEDLATINO_BASE}/tipo/serie/` : `${ANIMEDLATINO_BASE}/tipo/serie/pagina/${p}/`;
    try {
      const html = await fetchText(url);
      const links = parseAnimeDLatinoIndex(html);
      if (!links.length) break;
      for (const link of links) {
        try {
          const dh = await fetchText(link);
          const d = parseAnimeDLatinoDetail(dh);
          if (d) titles.push(detailToTitle("animedlatino", link, d, "anime"));
        } catch {
          /* siguiente */
        }
      }
      const total = parseAnimeDLatinoPagination(html);
      if (p >= total) break;
    } catch {
      break;
    }
  }
  return titles;
}

export async function scrapeJkAnime(maxPages = 5): Promise<Title[]> {
  const titles: Title[] = [];
  const seen = new Set<string>();
  // página principal
  try {
    const html = await fetchText(`${JKANIME_BASE}/`);
    const links = parseJkAnimeIndex(html);
    for (const link of links) {
      if (seen.has(link)) continue;
      seen.add(link);
      try {
        const dh = await fetchText(link);
        const d = parseJkAnimeDetail(dh);
        if (d) titles.push(detailToTitle("jkanime", link, d, "anime"));
      } catch {
        /* siguiente */
      }
    }
  } catch {
    /* */
  }
  return titles;
}

/** Ejecuta todos los scrapers y devuelve títulos unificados. */
export async function scrapeAllAnime(opts: { animeOnlinePages?: number; animeDLatinoPages?: number; jkAnimePages?: number } = {}): Promise<Title[]> {
  const [a, b, c] = await Promise.all([
    scrapeAnimeOnline(opts.animeOnlinePages ?? 10),
    scrapeAnimeDLatino(opts.animeDLatinoPages ?? 20),
    scrapeJkAnime(opts.jkAnimePages ?? 5),
  ]);
  return [...a, ...b, ...c];
}

/** Carga el JSON estático generado por GitHub Actions. */
export async function loadAnime(fresh = false): Promise<Title[]> {
  const r = await fetch(`${ANIMEONLINE_JSON}${fresh ? `?v=${Date.now()}` : ""}`, {
    cache: fresh ? "no-store" : "default",
  });
  if (!r.ok) return [];
  const j = await r.json();
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.titles)) return j.titles;
  return [];
}