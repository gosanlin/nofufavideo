import type { Title } from "./types";
import { buildTitle, cleanName, hash } from "./library";

export const PELISFLIX_BASE = "https://pelisflix1.guru";
export const PELISFLIX_JSON = `${import.meta.env?.BASE_URL ?? "./"}pelisflix.json`;

export function decodePelisflixUrl(b64: string): string {
  try { return (typeof atob === "function" ? atob(b64.trim()) : Buffer.from(b64.trim(), "base64").toString("utf8")); } catch { return ""; }
}

export function parsePelisflixIndexHtml(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(https?:\/\/pelisflix1\.guru\/(?:pelicula|serie)\/[^"]+)"/g)) out.add(m[1]);
  for (const m of html.matchAll(/href="(\/(?:pelicula|serie)\/[^"]+)"/g)) out.add(PELISFLIX_BASE + m[1]);
  return [...out];
}

export function parsePelisflixSeasonUrls(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(https?:\/\/pelisflix1\.guru\/temporada\/[^"]+)"/g)) out.add(m[1]);
  for (const m of html.matchAll(/href="(\/temporada\/[^"]+)"/g)) out.add(PELISFLIX_BASE + m[1]);
  return [...out];
}

export function parsePelisflixEpisodeUrls(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(https?:\/\/pelisflix1\.guru\/episodio\/[^"]+)"/g)) out.add(m[1]);
  for (const m of html.matchAll(/href="(\/episodio\/[^"]+)"/g)) out.add(PELISFLIX_BASE + m[1]);
  return [...out];
}

export function parsePelisflixDetailHtml(html: string): { title: string; urls: string[] } | null {
  const urls = [...new Set([...html.matchAll(/data-url="([^"]+)"/g)].map((m) => decodePelisflixUrl(m[1])).filter(Boolean))];
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : "";
  title = title.replace(/^Ver\s+/i, "").replace(/\s+Online.*$/i, "").replace(/\s+Completa.*$/i, "").trim();
  if (!urls.length && !title) return null;
  return { title: title || "Sin título", urls };
}

export function titlesFromPelisflixRaw(raw: unknown[]): Title[] {
  const movies: { title: string; urls: string[] }[] = [];
  const seriesMap = new Map<string, { season: number; number: number; urls: string[]; name?: string }[]>();
  for (const item of raw as Record<string, unknown>[]) {
    const urls = ((item.urls as string[]) ?? (item.servers as string[]) ?? (item.url ? [String(item.url)] : [])).filter(Boolean);
    if (item.kind === "series" || item.series) {
      const series = String(item.series ?? item.title ?? "Serie");
      if (!seriesMap.has(series)) seriesMap.set(series, []);
      seriesMap.get(series)!.push({
        season: Number(item.season ?? 1),
        number: Number(item.number ?? 0),
        urls,
        name: item.name ? String(item.name) : undefined,
      });
    } else {
      movies.push({ title: String(item.title ?? item.name ?? "Película"), urls });
    }
  }
  const titles: Title[] = [];
  for (const m of movies) {
    if (!m.urls.length) continue;
    titles.push(buildTitle({
      id: `pelisflix-${hash(m.title)}`,
      name: m.title,
      kindHint: "movie",
      files: [{ rel: m.title, name: m.title, url: m.urls[0], servers: m.urls, mirrors: m.urls }],
    }));
  }
  for (const [series, eps] of seriesMap) {
    const files = eps
      .filter((e) => e.urls.length)
      .map((e, i) => ({
        rel: `S${e.season}E${e.number || i + 1}`,
        name: e.name || `Episodio ${e.number || i + 1}`,
        url: e.urls[0],
        servers: e.urls,
        mirrors: e.urls,
      }));
    if (!files.length) continue;
    titles.push(buildTitle({
      id: `pelisflix-${hash(series)}`,
      name: series,
      kindHint: "series",
      files,
    }));
  }
  return titles;
}

export async function loadPelisflix(fresh = false): Promise<Title[]> {
  const r = await fetch(`${PELISFLIX_JSON}${fresh ? `?v=${Date.now()}` : ""}`, { cache: fresh ? "no-store" : "default" });
  if (!r.ok) return [];
  const j = await r.json();
  if (Array.isArray(j)) return j as Title[];
  if (j && Array.isArray(j.titles)) return j.titles as Title[];
  return [];
}

export async function scrapePelisflix(): Promise<Title[]> {
  const raw: Record<string, unknown>[] = [];
  // películas: primeras páginas
  for (let page = 1; page <= 3; page++) {
    try {
      const path = page === 1 ? "/peliculas-online/" : `/peliculas-online/page/${page}/`;
      const r = await fetch(PELISFLIX_BASE + path);
      const html = await r.text();
      const links = parsePelisflixIndexHtml(html).filter((u) => /\/pelicula\//i.test(u));
      for (const link of links) {
        try {
          const rr = await fetch(link);
          const hh = await rr.text();
          const p = parsePelisflixDetailHtml(hh);
          if (p && p.urls.length) raw.push({ kind: "movie", title: p.title, urls: p.urls });
        } catch { /* */ }
      }
    } catch { /* */ }
  }
  // series: primeras páginas
  try {
    const r = await fetch(PELISFLIX_BASE + "/series-online/");
    const html = await r.text();
    const seriesLinks = parsePelisflixIndexHtml(html).filter((u) => /\/serie\//i.test(u));
    for (const slink of seriesLinks.slice(0, 8)) {
      try {
        const rr = await fetch(slink);
        const hh = await rr.text();
        const seasonUrls = parsePelisflixSeasonUrls(hh);
        const seriesTitle = parsePelisflixDetailHtml(hh)?.title || slink.split("/").filter(Boolean).pop() || "Serie";
        const seasons = seasonUrls.length ? seasonUrls : [];
        for (const seasonUrl of seasons) {
          try {
            const sr = await fetch(seasonUrl);
            const sh = await sr.text();
            const epUrls = parsePelisflixEpisodeUrls(sh);
            for (const epUrl of epUrls) {
              try {
                const er = await fetch(epUrl);
                const eh = await er.text();
                const p = parsePelisflixDetailHtml(eh);
                const m = epUrl.match(/(\d+)x(\d+)/);
                if (p && p.urls.length) raw.push({
                  kind: "series",
                  series: seriesTitle,
                  season: m ? Number(m[1]) : 1,
                  number: m ? Number(m[2]) : 0,
                  urls: p.urls,
                });
              } catch { /* */ }
            }
          } catch { /* */ }
        }
      } catch { /* */ }
    }
  } catch { /* */ }
  return titlesFromPelisflixRaw(raw);
}
