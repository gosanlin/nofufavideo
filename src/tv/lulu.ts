import { buildTitle, cleanName, hash } from "./library";
import type { Title } from "./types";

/** Configuración de LuluStream / Luluvido (heredada de LuluFlix). */
export const LULU = {
  EMBED_BASE: "https://luluvido.com/e/",
  API_BASE: "https://api.lulustream.com/api",
  /** Opcional: clave en tiempo de build (VITE_LULU_API_KEY). Queda visible en la web. */
  API_KEY: (import.meta.env["VITE_LULU_API_KEY"] as string | undefined) ?? "",
  JSON: `${import.meta.env.BASE_URL ?? "./"}videos.json`,
};

export interface LuluVideo {
  code: string;
  title: string;
  thumb?: string;
  length?: string;
  folder?: string;
}

/** Duración (segundos) de cada vídeo según la API, para empezar en un punto aleatorio en TV en directo. */
const LENGTHS = new Map<string, number>();
export const lengthOf = (url: string) => LENGTHS.get(url) ?? 0;

/** URL del embed con reproducción automática y, opcionalmente, segundo de inicio. */
export function embedSrc(url: string, at = 0, autoplay = false): string {
  if (!autoplay && !at) return url;
  const p = new URLSearchParams();
  if (autoplay) p.set("autoplay", "1");
  if (at > 0) { const s = String(Math.floor(at)); p.set("t", s); p.set("start", s); }
  return `${url}${url.includes("?") ? "&" : "?"}${p}#t=${Math.floor(at)}`;
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

/** Agrupa los vídeos de Luluvido en títulos de Nofufa (series por patrón SxxEyy, resto películas). */
export function titlesFromLulu(list: LuluVideo[]): Title[] {
  const groups = new Map<string, LuluVideo[]>();
  for (const v of list.filter((x) => x.code)) {
    const len = parseFloat(v.length ?? "");
    if (len > 0) LENGTHS.set(embedUrl(v.code), len);
    const k = seriesKey(v) ?? `__${v.code}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const now = Date.now();
  return [...groups].map(([k, vids], gi) => {
    const series = !k.startsWith("__");
    const name = series ? k : vids[0]!.title;
    const thumb = vids.find((v) => v.thumb)?.thumb;
    return buildTitle({
      id: `lulu-${hash(k)}`,
      name,
      kindHint: series ? "series" : "movie",
      files: vids.map((v, i) => ({
        rel: series ? v.title : `${v.title}.mp4`,
        name: v.title,
        url: embedUrl(v.code),
        mtime: now - (gi * 100 + i) * 1000,
      })),
      images: thumb ? { poster: thumb, background: thumb } : undefined,
    });
  });
}

const parseJson = (t: string) => JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
const GATEWAYS = [
  (u: string) => u,
  (u: string) => "https://api.allorigins.win/get?url=" + encodeURIComponent(u),
  (u: string) => "https://r.jina.ai/" + u,
];

async function fromApi(): Promise<LuluVideo[]> {
  if (!LULU.API_KEY) throw new Error("sin clave");
  const out: LuluVideo[] = [];
  for (let p = 1; p <= 50; p++) {
    const u = `${LULU.API_BASE}/file/list?key=${encodeURIComponent(LULU.API_KEY)}&per_page=200&page=${p}`;
    let j: { status?: number; contents?: string; result?: { files?: unknown[] } } | null = null;
    for (const g of GATEWAYS) {
      try {
        const r = await fetch(g(u), { cache: "no-store" });
        if (!r.ok) continue;
        let x = parseJson(await r.text());
        if (typeof x.contents === "string") x = parseJson(x.contents);
        if (x.status === 200) { j = x; break; }
      } catch { /* siguiente pasarela */ }
    }
    if (!j) throw new Error("API no disponible");
    const files = j.result?.files ?? [];
    out.push(...files.map(normalize));
    if (files.length < 200) break;
  }
  return out;
}

async function fromJson(): Promise<LuluVideo[]> {
  const r = await fetch(`${LULU.JSON}?v=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("No se encontró videos.json");
  const j = await r.json();
  return (Array.isArray(j) ? j : j.files ?? []).map(normalize);
}

/** Carga el catálogo: videos.json (generado por GitHub Actions) y, si está vacío, la API en directo. */
export async function loadLulu(fresh = false): Promise<Title[]> {
  let list: LuluVideo[] = [];
  // "Recargar catálogo": primero la API en directo (vídeos nuevos al momento), después videos.json
  if (fresh) { try { list = await fromApi(); } catch { /* sin api */ } }
  if (!list.length) { try { list = await fromJson(); } catch { /* sin json */ } }
  if (!list.length && !fresh) {
    try { list = await fromApi(); } catch { /* sin api */ }
  }
  return titlesFromLulu(list);
}
