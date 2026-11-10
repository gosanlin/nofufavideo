/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EpisodeMeta, Kind, Meta, MetaCandidate } from "./types";

import { MIN_SCORE, fold, queryVariants, score, type Query } from "./match";

const CACHE_KEY = "nofufa-meta-v6"; // v6: nombres de episodio también en español
const MISS_TTL = 2 * 24 * 3600_000; // los "no encontrado" se reintentan a los 2 días
type Entry = { m: Meta | null; t: number };
let disk: Record<string, Entry> = {};
try {
  localStorage.removeItem("nofufa-meta-v5");
  disk = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
} catch {
  /* */
}
const mem = new Map<string, Promise<Meta | null>>();
const yearOf = (v: unknown) => {
  const m = String(v ?? "").match(/(19|20)\d{2}/);
  return m ? +m[0] : undefined;
};

async function cinemeta(q: Query, kind: "series" | "movie"): Promise<Meta | null> {
  const r = await fetch(
    `https://v3-cinemeta.strem.io/catalog/${kind}/top/search=${encodeURIComponent(q.text)}.json`,
  );
  if (!r.ok) return null;
  const metas: any[] = (await r.json()).metas ?? [];
  let best: any = null,
    bs = -1;
  for (const m of metas) {
    const s = score(q.text, m.name ?? "", q.year, yearOf(m.releaseInfo ?? m.year));
    if (s > bs) {
      bs = s;
      best = m;
    }
  }
  if (!best || bs < MIN_SCORE) return null;
  return cinemetaDetail(kind, best);
}

async function cinemetaDetail(kind: "series" | "movie", best: any): Promise<Meta> {
  const id = best.imdb_id ?? best.id;
  let m: any = best;
  try {
    const d = await fetch(`https://v3-cinemeta.strem.io/meta/${kind}/${id}.json`);
    if (d.ok) m = { ...best, ...(await d.json()).meta };
  } catch {
    /* */
  }
  const episodes: EpisodeMeta[] | undefined = Array.isArray(m.videos)
    ? m.videos
        .filter((v: any) => v.season > 0)
        .map((v: any) => ({
          season: v.season,
          episode: v.episode ?? v.number,
          name: v.name ?? v.title,
          overview: v.overview ?? v.description,
          thumbnail: v.thumbnail,
          released: v.released,
        }))
    : undefined;
  return {
    title: m.name,
    year: m.releaseInfo ?? m.year ?? "",
    description: m.description ?? "",
    genres: (m.genres ?? []).slice(0, 4),
    cast: (m.cast ?? []).slice(0, 4),
    runtime: m.runtime,
    rating: m.imdbRating,
    poster: m.poster,
    background: m.background ?? `https://images.metahub.space/background/large/${id}/img`,
    logo: m.logo,
    episodes,
    source: "cinemeta",
    kind: kind === "movie" ? "movie" : "series",
    imdbId: /^tt\d+$/.test(String(id)) ? String(id) : undefined,
  };
}

async function anilist(q: Query): Promise<Meta | null> {
  const query = `query($s:String){Media(search:$s,type:ANIME){${ANI_FIELDS}}}`;
  const r = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { s: q.text } }),
  });
  if (!r.ok) return null;
  const m = (await r.json())?.data?.Media;
  if (!m) return null;
  const names: string[] = [m.title.english, m.title.romaji, ...(m.synonyms ?? [])].filter(Boolean);
  if (Math.max(0, ...names.map((n) => score(q.text, n))) < MIN_SCORE) return null;
  return aniMeta(m);
}

const ANI_FIELDS = `id idMal title{romaji english native} synonyms description(asHtml:false) seasonYear genres averageScore format coverImage{extraLarge} bannerImage streamingEpisodes{title thumbnail} characters(perPage:4,sort:ROLE){nodes{name{full}}}`;
function aniMeta(m: any): Meta {
  const t = m.title.english ?? m.title.romaji;
  return {
    title: t,
    year: String(m.seasonYear ?? ""),
    description: (m.description ?? "").replace(/<[^>]+>/g, ""),
    genres: (m.genres ?? []).slice(0, 4),
    cast: (m.characters?.nodes ?? []).map((c: any) => c.name.full),
    rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : undefined,
    poster: m.coverImage?.extraLarge,
    background: m.bannerImage ?? m.coverImage?.extraLarge,
    episodes: (m.streamingEpisodes ?? []).map((e: any, i: number) => ({
      season: 1,
      episode: i + 1,
      name: e.title?.replace(/^Episode \d+ - /, ""),
      thumbnail: e.thumbnail,
    })),
    source: "anilist",
    kind: m.format === "MOVIE" ? "movie" : "anime",
    malId: m.idMal ?? undefined,
    anilistId: m.id ?? undefined,
  };
}

async function tvmaze(q: Query): Promise<Meta | null> {
  const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q.text)}`);
  if (!r.ok) return null;
  let best: any = null,
    bs = -1;
  for (const { show } of (await r.json()) as any[]) {
    const sc = score(q.text, show.name ?? "", q.year, yearOf(show.premiered));
    if (sc > bs) {
      bs = sc;
      best = show;
    }
  }
  if (!best || bs < MIN_SCORE || !best.image) return null;
  return {
    title: best.name,
    year: String(yearOf(best.premiered) ?? ""),
    description: (best.summary ?? "").replace(/<[^>]+>/g, ""),
    genres: (best.genres ?? []).slice(0, 4),
    rating: best.rating?.average ? String(best.rating.average) : undefined,
    poster: (best.image.original ?? best.image.medium)?.replace("http://", "https://"),
    background: (best.image.original ?? best.image.medium)?.replace("http://", "https://"),
    source: "cinemeta",
    kind: "series",
  };
}

async function kitsu(q: Query): Promise<Meta | null> {
  const r = await fetch(
    `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q.text)}&page[limit]=6`,
    { headers: { Accept: "application/vnd.api+json" } },
  );
  if (!r.ok) return null;
  let best: any = null,
    bs = -1;
  for (const { attributes: a } of ((await r.json()).data ?? []) as any[]) {
    const names: string[] = [
      a.canonicalTitle,
      ...Object.values(a.titles ?? {}),
      ...(a.abbreviatedTitles ?? []),
    ].filter(Boolean) as string[];
    const sc = Math.max(0, ...names.map((n) => score(q.text, n, q.year, yearOf(a.startDate))));
    if (sc > bs) {
      bs = sc;
      best = a;
    }
  }
  if (!best || bs < MIN_SCORE || !best.posterImage) return null;
  return {
    title: best.titles?.en ?? best.canonicalTitle,
    year: String(yearOf(best.startDate) ?? ""),
    description: best.synopsis ?? "",
    genres: [],
    rating: best.averageRating ? (best.averageRating / 10).toFixed(1) : undefined,
    poster: best.posterImage.large ?? best.posterImage.original,
    background: best.coverImage?.large ?? best.coverImage?.original ?? best.posterImage.large,
    source: "anilist",
    kind: "anime",
  };
}

/* ---------- traducción al español ---------- */
async function tr(text: string): Promise<string | null> {
  if (!text.trim()) return text;
  try {
    const b = typeof window !== "undefined" ? window.nofufa : undefined;
    if (b?.translate) {
      const r = await b.translate(text);
      return r ? r.text : null;
    }
    const r = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=" +
        encodeURIComponent(text),
    );
    if (!r.ok) return null;
    const j = await r.json();
    return (j[0] ?? []).map((x: any) => x[0]).join("");
  } catch {
    return null;
  }
}
/** Traduce varios textos en bloques (una línea por texto). */
async function trMany(texts: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = texts.map(() => null);
  let i = 0;
  while (i < texts.length) {
    let j = i,
      len = 0;
    while (j < texts.length && (j === i || len + texts[j]!.length < 3500)) len += texts[j++]!.length + 1;
    const chunk = texts.slice(i, j).map((t) => t.replace(/\s*\n+\s*/g, " "));
    const r = await tr(chunk.join("\n"));
    const lines = r?.split("\n");
    if (lines && lines.length === chunk.length) lines.forEach((l, k) => (out[i + k] = l.trim()));
    else if (chunk.length > 1)
      for (let k = 0; k < chunk.length; k++) out[i + k] = await tr(chunk[k]!);
    i = j;
  }
  return out;
}
async function toSpanish(m: Meta): Promise<Meta> {
  const desc = m.description ? await tr(m.description) : null;
  const eps = m.episodes ?? [];
  const episodes = eps.map((e) => ({ ...e }));
  for (const field of ["overview", "name"] as const) {
    const idx = eps.map((e, i) => (e[field]?.trim() ? i : -1)).filter((i) => i >= 0);
    const done = idx.length ? await trMany(idx.map((i) => eps[i]![field]!)) : [];
    idx.forEach((i, k) => {
      if (done[k]) episodes[i]![field] = done[k]!;
    });
  }
  return { ...m, description: desc ?? m.description, episodes: m.episodes ? episodes : undefined };
}

export function fetchMeta(name: string, kind: Kind): Promise<Meta | null> {
  const key = `${kind}:${fold(name)}`;
  const hit = disk[key];
  if (hit && (hit.m || Date.now() - hit.t < MISS_TTL)) return Promise.resolve(hit.m);
  if (!mem.has(key)) {
    const providers: ((q: Query) => Promise<Meta | null>)[] =
      kind === "anime"
        ? [anilist, kitsu, (q) => cinemeta(q, "series"), tvmaze]
        : kind === "movie"
          ? [(q) => cinemeta(q, "movie"), anilist, (q) => cinemeta(q, "series")]
          : [(q) => cinemeta(q, "series"), anilist, tvmaze, (q) => cinemeta(q, "movie"), kitsu];
    mem.set(
      key,
      (async () => {
        let res: Meta | null = null,
          failed = false;
        // primero la variante más específica en todos los proveedores, luego las más generales
        outer: for (const q of queryVariants(name)) {
          for (const f of providers) {
            try {
              res = await f(q);
              if (res) break outer;
            } catch {
              failed = true;
            }
          }
        }
        if (res) res = await toSpanish(res);
        if (res || !failed) {
          disk[key] = { m: res, t: Date.now() };
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(disk));
          } catch {
            /* lleno */
          }
        }
        return res;
      })(),
    );
  }
  return mem.get(key)!;
}

export function clearMetaCache() {
  disk = {};
  mem.clear();
  for (const k of ["nofufa-meta-v3", "nofufa-meta-v4", "nofufa-meta-v5", CACHE_KEY]) localStorage.removeItem(k);
}

/* ---------- "Corregir datos": varias opciones y búsqueda manual ---------- */
const strip = (x: unknown) => String(x ?? "").replace(/<[^>]+>/g, "");
const https = (u?: string) => u?.replace("http://", "https://");

/** Todos los resultados posibles de todas las fuentes, ordenados por parecido. */
export async function searchMetaCandidates(
  text: string,
  kind: Kind | "" = "",
  year?: number,
): Promise<MetaCandidate[]> {
  const q = text.trim();
  if (!q) return [];
  const jobs: Promise<MetaCandidate[]>[] = [];
  const cin = async (k: "movie" | "series") => {
    const r = await fetch(
      `https://v3-cinemeta.strem.io/catalog/${k}/top/search=${encodeURIComponent(q)}.json`,
    );
    if (!r.ok) return [];
    return ((await r.json()).metas ?? []).slice(0, 10).map(
      (m: any): MetaCandidate => ({
        key: `cinemeta:${k}:${m.imdb_id ?? m.id}`,
        provider: "cinemeta",
        title: m.name,
        year: String(m.releaseInfo ?? m.year ?? ""),
        kind: k,
        poster: m.poster,
        description: m.description,
      }),
    );
  };
  if (kind !== "series" && kind !== "anime") jobs.push(cin("movie"));
  if (kind !== "movie") jobs.push(cin("series"));
  if (kind === "" || kind === "anime" || kind === "series" || kind === "video") {
    jobs.push(
      (async () => {
        const r = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: `query($s:String){Page(perPage:8){media(search:$s,type:ANIME){id title{romaji english} seasonYear format description(asHtml:false) coverImage{large}}}}`,
            variables: { s: q },
          }),
        });
        if (!r.ok) return [];
        return ((await r.json())?.data?.Page?.media ?? []).map(
          (m: any): MetaCandidate => ({
            key: `anilist:${m.id}`,
            provider: "anilist",
            title: m.title.english ?? m.title.romaji,
            year: String(m.seasonYear ?? ""),
            kind: m.format === "MOVIE" ? "movie" : "anime",
            poster: m.coverImage?.large,
            description: strip(m.description),
          }),
        );
      })(),
      (async () => {
        const r = await fetch(
          `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=6`,
          { headers: { Accept: "application/vnd.api+json" } },
        );
        if (!r.ok) return [];
        return ((await r.json()).data ?? []).map(
          (d: any): MetaCandidate => ({
            key: `kitsu:${d.id}`,
            provider: "kitsu",
            title: d.attributes.titles?.en ?? d.attributes.canonicalTitle,
            year: String(yearOf(d.attributes.startDate) ?? ""),
            kind: d.attributes.subtype === "movie" ? "movie" : "anime",
            poster: d.attributes.posterImage?.medium,
            description: d.attributes.synopsis,
          }),
        );
      })(),
    );
  }
  if (kind !== "movie")
    jobs.push(
      (async () => {
        const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
        if (!r.ok) return [];
        return ((await r.json()) as any[]).slice(0, 8).map(
          ({ show }: any): MetaCandidate => ({
            key: `tvmaze:${show.id}`,
            provider: "tvmaze",
            title: show.name,
            year: String(yearOf(show.premiered) ?? ""),
            kind: "series",
            poster: https(show.image?.medium),
            description: strip(show.summary),
          }),
        );
      })(),
    );
  const all = (await Promise.allSettled(jobs)).flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  const seen = new Set<string>();
  return all
    .filter((c) => c.title && !seen.has(c.key) && seen.add(c.key))
    .map((c) => ({ c, s: score(q, c.title, year, yearOf(c.year)) + (c.poster ? 2 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

/** Datos completos (en español) de un resultado elegido. */
export async function loadCandidate(c: MetaCandidate): Promise<Meta | null> {
  const [prov, a, b] = c.key.split(":");
  let m: Meta | null = null;
  if (prov === "cinemeta") m = await cinemetaDetail(a as "movie" | "series", { id: b, name: c.title });
  else if (prov === "anilist") {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){${ANI_FIELDS}}}`,
        variables: { id: +a! },
      }),
    });
    const d = r.ok ? (await r.json())?.data?.Media : null;
    m = d ? aniMeta(d) : null;
  } else if (prov === "tvmaze") {
    const r = await fetch(`https://api.tvmaze.com/shows/${a}?embed=episodes`);
    if (r.ok) {
      const s: any = await r.json();
      m = {
        title: s.name,
        year: String(yearOf(s.premiered) ?? ""),
        description: strip(s.summary),
        genres: (s.genres ?? []).slice(0, 4),
        rating: s.rating?.average ? String(s.rating.average) : undefined,
        poster: https(s.image?.original ?? s.image?.medium),
        background: https(s.image?.original ?? s.image?.medium),
        imdbId: s.externals?.imdb ?? undefined,
        episodes: (s._embedded?.episodes ?? []).map((e: any) => ({
          season: e.season,
          episode: e.number,
          name: e.name,
          overview: strip(e.summary),
          thumbnail: https(e.image?.medium),
          released: e.airdate,
        })),
        source: "cinemeta",
        kind: "series",
      };
    }
  } else if (prov === "kitsu") {
    const r = await fetch(`https://kitsu.io/api/edge/anime/${a}`, {
      headers: { Accept: "application/vnd.api+json" },
    });
    const d = r.ok ? (await r.json()).data?.attributes : null;
    if (d)
      m = {
        title: d.titles?.en ?? d.canonicalTitle,
        year: String(yearOf(d.startDate) ?? ""),
        description: d.synopsis ?? "",
        genres: [],
        rating: d.averageRating ? (d.averageRating / 10).toFixed(1) : undefined,
        poster: d.posterImage?.large ?? d.posterImage?.original,
        background: d.coverImage?.large ?? d.posterImage?.large,
        source: "anilist",
        kind: d.subtype === "movie" ? "movie" : "anime",
      };
  }
  return m ? toSpanish(m) : null;
}
