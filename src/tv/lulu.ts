import { buildTitle, cleanName, hash, parseEpisode } from "./library";
import { parseDub, sortDubs, type Dub } from "./dubs";
import type { Title } from "./types";

/** Configuración de LuluStream / Luluvido (heredada de LuluFlix). */
export const LULU = {
  EMBED_BASE: "https://lulustream.com/e/",
  API_BASE: "https://api.lulustream.com/api",
  /** Nunca se incluye una clave en la web publicada: solo la que cada visitante guarde en su navegador. */
  API_KEY: "",
  JSON: `${import.meta.env?.BASE_URL ?? "./"}videos.json`,
};

export interface LuluVideo {
  code: string;
  title: string;
  thumb?: string;
  length?: string;
  folder?: string;
  uploaded?: string;
}


/** URL del embed con reproducción automática y, opcionalmente, segundo de inicio. */
export function embedSrc(url: string, at = 0, autoplay = false): string {
  if (!autoplay && !at) return url;
  const p = new URLSearchParams();
  if (autoplay) p.set("autoplay", "1");
  if (at > 0) { const s = String(Math.floor(at)); p.set("t", s); p.set("start", s); }
  return `${url}${url.includes("?") ? "&" : "?"}${p}#t=${Math.floor(at)}`;
}

/** Duración de LuluStream ("1234" segundos o "01:02:03") a segundos. */
export function parseLength(l?: string): number | undefined {
  if (!l) return undefined;
  const n = l.includes(":") ? l.split(":").reduce((a, x) => a * 60 + (Number(x) || 0), 0) : Number(l);
  return n > 0 && Number.isFinite(n) ? n : undefined;
}

export const embedUrl = (code: string) => LULU.EMBED_BASE + encodeURIComponent(code);
export const isEmbed = (url: string) => url.startsWith(LULU.EMBED_BASE) || /\/e\/[a-z0-9]+$/i.test(url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalize(v: any): LuluVideo {
  const code = String(v.code || v.file_code || v.filecode || "");
  return {
    code,
    title: String(v.title || v.name || v.file_title || code),
    thumb: v.thumb || v.thumbnail || v.single_img || v.splash_img || "",
    length: v.length ? String(v.length) : "",
    folder: v.folder || v.fld_name || "",
    uploaded: String(v.uploaded || v.created || ""),
  };
}

const EP = /\b(s\d{1,2}\s*[ ._-]?\s*e\d{1,4}|\d{1,2}x\d{1,3}|(?:cap(?:itulo|ítulo)?|ep(?:isodio|isode)?)\s*[ ._-]?\d{1,4})\b/i;

/** Nombre de la serie a partir del título del vídeo ("Show S01E02 ..." -> "Show"). */
export function seriesKey(v: LuluVideo): string | null {
  if (v.folder) return v.folder;
  const m = v.title.match(EP);
  if (!m || m.index === undefined) return null;
  const name = cleanName(v.title.slice(0, m.index)).replace(/[\s\-–:]+$/, "");
  return name || null;
}

/** Agrupa los vídeos de Luluvido en títulos de Nofufa (series por patrón SxxEyy, resto películas).
 * Las versiones del mismo episodio con etiqueta de idioma ([LAT], [ESP]…) se unen con selector de doblaje. */
export function titlesFromLulu(list: LuluVideo[]): Title[] {
  const groups = new Map<string, { v: LuluVideo; lang?: string | undefined }[]>();
  for (const raw of list.filter((x) => x.code)) {
    const d = parseDub(raw.title);
    const v = d.lang ? { ...raw, title: d.title } : raw;
    const sk = seriesKey(v);
    // Las películas se agrupan por título normalizado para unir duplicados del mismo título.
    const k = sk
      ? `series:${cleanName(sk).toLowerCase()}`
      : `movie:${cleanName(v.title).toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), { v, lang: d.lang }]);
  }
  const now = Date.now();
  return [...groups].map(([k, items], gi) => {
    const series = k.startsWith("series:");
    const seriesName = series ? (seriesKey(items[0]!.v) ?? items[0]!.v.title) : items[0]!.v.title;
    // mismo episodio (o misma película) = un solo vídeo con varios doblajes/servidores
    const eps = new Map<string, { v: LuluVideo; lang?: string | undefined }[]>();
    items.forEach((it, i) => {
      let ek: string;
      if (series) {
        const p = parseEpisode(it.v.title, i);
        ek = `${p.season}x${p.number}${p.last ? `-${p.last}` : ""}`;
      } else {
        ek = "movie";
      }
      eps.set(ek, [...(eps.get(ek) ?? []), it]);
    });
    const files = [...eps.values()].map((variants, i) => {
      const hasLang = variants.some((x) => x.lang);
      const dubs: Dub[] | undefined = hasLang
        ? sortDubs(
            mergeDubsByLang(
              variants.map((x) => ({
                lang: x.lang ?? "DUAL",
                url: embedUrl(x.v.code),
                duration: parseLength(x.v.length),
                servers: [embedUrl(x.v.code)],
                mirrors: [embedUrl(x.v.code)],
              })),
            ),
          )
        : undefined;
      // servidores cuando no hay doblajes
      const allUrls = variants.map((x) => embedUrl(x.v.code));
      const servers = hasLang ? undefined : [...new Set(allUrls)];
      const main = dubs && dubs.length
        ? variants.find((x) => embedUrl(x.v.code) === dubs[0]!.url)!.v
        : variants[0]!.v;
      return {
        rel: series ? main.title : `${main.title}.mp4`,
        name: main.title,
        url: embedUrl(main.code),
        duration: parseLength(main.length),
        mtime: Math.max(...variants.map((x) => Date.parse(String(x.v.uploaded ?? "").replace(" ", "T")) || 0)) || now - (gi * 100 + i) * 1000,
        dubs,
        servers,
        mirrors: servers,
      };
    });
    const name = series ? seriesName : items[0]!.v.title;
    const thumb = items.find((x) => x.v.thumb)?.v.thumb;
    return buildTitle({
      id: `lulu-${hash(k)}`,
      name,
      kindHint: series ? "series" : "movie",
      files,
      images: thumb ? { poster: thumb, background: thumb } : undefined,
    });
  });
}

function mergeDubsByLang(dubs: Dub[]): Dub[] {
  const byLang = new Map<string, Dub>();
  for (const d of dubs) {
    const lang = d.lang || "DUAL";
    const urls = [...new Set([d.url, ...(d.servers ?? []), ...(d.mirrors ?? [])].filter(Boolean))];
    const existing = byLang.get(lang);
    if (!existing) byLang.set(lang, { ...d, lang, url: d.url || urls[0] || "", servers: urls, mirrors: urls });
    else {
      const servers = [...new Set([...(existing.servers ?? []), ...urls])];
      byLang.set(lang, { ...existing, servers, mirrors: servers, url: existing.url || urls[0] || "" });
    }
  }
  return [...byLang.values()];
}

const parseJson = (t: string) => JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
/**
 * La API de LuluStream no permite llamadas desde otras webs (sin cabecera CORS), así que desde
 * GitHub Pages pedirla directamente SIEMPRE falla. Solo se usan pasarelas públicas que sí la añaden.
 * La fuente principal es videos.json, que GitHub Actions genera con el secreto LULU_API_KEY.
 */
const GATEWAYS = [
  (u: string) => "https://r.jina.ai/" + u,
  (u: string) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u: string) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
];
/** una pasarela colgada no debe bloquear la carga del catálogo */
const GATEWAY_TIMEOUT = 10_000;

/** Clave de Luluvido guardada en este navegador (Ajustes), o la de la build. */
const KEY_STORE = "nofufa.luluKey";
export const getApiKey = () => {
  try { return localStorage.getItem(KEY_STORE) || LULU.API_KEY; } catch { return LULU.API_KEY; }
};
export const setApiKey = (k: string) => {
  try { if (k.trim()) localStorage.setItem(KEY_STORE, k.trim()); else localStorage.removeItem(KEY_STORE); } catch { /* */ }
};

type ApiPage = { status?: number; msg?: string; contents?: string; result?: { files?: unknown[]; pages?: number | string } };

async function apiPage(key: string, p: number): Promise<ApiPage> {
  // "_" rompe la caché de las pasarelas: sin él devuelven la lista antigua y no salen los vídeos nuevos
  const u = `${LULU.API_BASE}/file/list?key=${encodeURIComponent(key)}&per_page=100&page=${p}&_=${Date.now()}`;
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(g(u), {
        cache: "no-store",
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(GATEWAY_TIMEOUT) : null,
      });
      if (!r.ok) continue;
      let x = parseJson(await r.text());
      if (typeof x.contents === "string") x = parseJson(x.contents);
      if (x.status === 200) return x;
    } catch { /* siguiente pasarela */ }
  }
  throw new Error("API no disponible");
}

/** Recorre TODAS las páginas que indica la API (antes se cortaba si una página traía menos de 200). */
export async function fromApi(key = getApiKey()): Promise<LuluVideo[]> {
  if (!key) throw new Error("sin clave");
  const out: LuluVideo[] = [];
  for (let p = 1; p <= 200; p++) {
    const j = await apiPage(key, p);
    const files = j.result?.files ?? [];
    out.push(...files.map(normalize));
    const pages = Number(j.result?.pages) || 0;
    if (!files.length || (pages ? p >= pages : files.length < 100)) break;
  }
  return out;
}

async function fromJson(): Promise<LuluVideo[]> {
  const r = await fetch(`${LULU.JSON}?v=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("No se encontró videos.json");
  const j = await r.json();
  return (Array.isArray(j) ? j : j.files ?? []).map(normalize);
}

/** Une listas sin repetir códigos; la primera lista manda (la API en directo es la más reciente). */
export function mergeVideos(...lists: LuluVideo[][]): LuluVideo[] {
  const seen = new Map<string, LuluVideo>();
  for (const l of lists) for (const v of l) if (v.code && !seen.has(v.code)) seen.set(v.code, v);
  return [...seen.values()];
}

/* ---------- catálogo guardado: persiste entre recargas (F5) ---------- */
const CACHE_KEY = "nofufa.catalog.v1";
export interface CatalogCache { at: number; videos: LuluVideo[] }
export function readCatalogCache(): CatalogCache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return c && Array.isArray(c.videos) && c.videos.length ? c : null;
  } catch { return null; }
}
function writeCatalogCache(videos: LuluVideo[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), videos })); } catch { /* lleno */ }
}

/**
 * Carga el catálogo. Sin `fresh` usa el catálogo guardado en el navegador (no se resetea al
 * pulsar F5). Solo se descarga de nuevo la primera vez o al sincronizar desde Ajustes.
 */
export async function loadLulu(fresh = false): Promise<Title[]> {
  const cache = readCatalogCache();
  // Siempre se consulta la fuente actual (API y/o videos.json) para que las
  // eliminaciones en LuluStream se reflejen; la caché solo se usa como respaldo
  // cuando no hay datos frescos disponibles.
  const [api, json] = await Promise.all([
    fromApi().catch(() => [] as LuluVideo[]),
    fromJson().catch(() => [] as LuluVideo[]),
  ]);
  const all = mergeVideos(api, json);
  if (all.length) {
    writeCatalogCache(all);
    return titlesFromLulu(all);
  }
  if (cache) return titlesFromLulu(cache.videos);
  if (fresh) return titlesFromLulu([]);
  return titlesFromLulu([]);
}
