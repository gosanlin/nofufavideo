import type { Episode, EpisodeMeta, Kind, ScannedTitle, SubSource, Title } from "./types";

export function cleanName(n: string) {
  return n
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\[[^\]]*\]|\([^)]*(?:1080|720|2160|x26|hevc|web|bluray)[^)]*\)/gi, " ")
    .replace(
      /\b(1080p|720p|2160p|4k|x264|x265|h264|h265|hevc|web-?dl|webrip|bluray|brrip|hdtv|aac|ac3|dts|10bit|multi|dual)\b/gi,
      " ",
    )
    .replace(/[._]+/g, " ")
    .replace(/\s+-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrae temporada y episodio de una ruta relativa (ej. "Temporada 2/S02E05 - Nombre.mkv"). */
export function parseEpisode(
  rel: string,
  fallbackIndex: number,
): { season: number; number: number; name: string } {
  const parts = rel.split(/[\\/]/);
  const file = parts[parts.length - 1] ?? rel;
  const base = file.replace(/\.[^.]+$/, "");
  let season = 0,
    number = 0;
  const m =
    base.match(/s(\d{1,2})\s*[ ._-]?\s*e(\d{1,4})/i) ?? base.match(/\b(\d{1,2})x(\d{1,3})\b/);
  if (m) {
    season = +m[1]!;
    number = +m[2]!;
  }
  if (!season) {
    for (const dir of parts.slice(0, -1).reverse()) {
      const d = dir.match(/(?:season|temporada|temp|staffel|saison|s)\s*[ ._-]?(\d{1,2})\b/i);
      if (d) {
        season = +d[1]!;
        break;
      }
    }
  }
  if (!number) {
    const e =
      base.match(/(?:ep(?:isodio|isode)?|cap(?:itulo|ítulo)?|e)\s*[ ._-]?(\d{1,4})/i) ??
      base.match(/\s-\s(\d{1,4})(?:v\d)?(?:\s|$)/) ??
      base.match(/^(\d{1,4})(?=[\s._-])/) ??
      base.match(/(?:^|[\s._-])(\d{1,3})(?:[\s._-]|$)(?!.*\d{1,3}(?:[\s._-]|$))/);
    if (e) number = +e[1]!;
  }
  let name = cleanName(base.replace(m?.[0] ?? "\0", " "));
  name = name.replace(/^[\s-]+|[\s-]+$/g, "");
  return { season: season || 1, number: number || fallbackIndex + 1, name };
}

const ANIME_HINT = /\b(anime|sub ?esp|fansub|\[.*\])\b/i;

export function detectKind(t: {
  name: string;
  kindHint: Kind | null;
  count: number;
  info?: { kind?: Kind | undefined } | null | undefined;
}): Kind {
  const k = t.info?.kind ?? t.kindHint;
  if (k && k !== "video") return k;
  if (ANIME_HINT.test(t.name)) return "anime";
  return t.count > 1 ? "series" : "movie";
}

export function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildTitle(s: {
  id: string;
  name: string;
  kindHint: Kind | null;
  files: {
    rel: string;
    name: string;
    url: string;
    path?: string;
    mtime?: number;
    subtitles?: SubSource[];
  }[];
  images?: Record<string, string> | undefined;
  info?: ScannedTitle["info"] | undefined;
}): Title {
  const kind = detectKind({
    name: s.name,
    kindHint: s.kindHint,
    count: s.files.length,
    info: s.info,
  });
  const episodes: Episode[] = s.files.map((f, i) => {
    const p = parseEpisode(f.rel, i);
    const isSingle = s.files.length === 1;
    return {
      id: hash(s.id + "/" + f.rel),
      titleId: s.id,
      name: isSingle ? cleanName(s.name) : tidyEpisodeName(p.name, s.name, p.number),
      season: p.season,
      number: p.number,
      url: f.url,
      path: f.path,
      subtitles: f.subtitles ?? [],
      added: f.mtime,
    };
  });
  episodes.sort((a, b) => a.season - b.season || a.number - b.number);
  return {
    id: s.id,
    name: cleanName(s.name),
    kind,
    episodes,
    images: s.images,
    added: Math.max(0, ...episodes.map((e) => e.added ?? 0)),
    meta: s.info?.title
      ? {
          title: s.info.title,
          year: s.info.year ?? "",
          description: s.info.description ?? "",
          genres: s.info.genres ?? [],
          source: "local",
        }
      : undefined,
  };
}

/** Datos de internet del episodio; si la numeración local es absoluta (S01E145) se busca por posición. */
export function episodeMeta(t: Title, e: Episode): EpisodeMeta | undefined {
  const list = t.meta?.episodes;
  if (!list?.length) return undefined;
  const exact = list.find((x) => x.season === e.season && x.episode === e.number);
  if (exact) return exact;
  const sameSeason = list.filter((x) => x.season === e.season).length;
  const seasons = new Set(t.episodes.map((x) => x.season)).size;
  if (seasons === 1 && e.number > sameSeason) {
    const sorted = [...list].sort((a, b) => a.season - b.season || a.episode - b.episode);
    return sorted[e.number - 1];
  }
  return undefined;
}

/** Nombre a mostrar: el de internet (en español) o, si no hay, el del archivo o "Episodio N". */
export function episodeTitle(t: Title, e: Episode): string {
  const n = episodeMeta(t, e)?.name?.trim();
  if (n && !/^(episode|episodio|ep\.?)\s*\d+$/i.test(n)) return n;
  return e.name || `Episodio ${e.number}`;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((19|20)\d{2}\)/g, "")
    .replace(/[^a-z0-9]+/g, "");

/** Quita el nombre de la serie del nombre del episodio; si no queda nada útil, "Episodio N". */
export function tidyEpisodeName(name: string, show: string, number: number): string {
  let n = name.trim();
  const s = norm(cleanName(show));
  if (s) {
    // recorta palabras iniciales mientras coincidan con el nombre de la serie
    const words = n.split(/\s+/);
    for (let k = words.length; k > 0; k--) {
      const head = norm(words.slice(0, k).join(" "));
      if (head && head === s) {
        n = words.slice(k).join(" ");
        break;
      }
    }
  }
  n = n.replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, "");
  if (!n || /^\d+$/.test(n) || norm(n) === s) return `Episodio ${number}`;
  if (/^(episode|ep)\s*\d+$/i.test(n)) return `Episodio ${number}`;
  return n;
}

export function seasonsOf(t: Title) {
  return [...new Set(t.episodes.map((e) => e.season))].sort((a, b) => a - b);
}

/** Cola aleatoria sin repetir hasta agotar todos los episodios. */
export function shuffleQueue<T>(items: T[], rand: () => number = Math.random, avoidFirst?: T): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  if (avoidFirst !== undefined && a.length > 1 && a[0] === avoidFirst)
    [a[0], a[1]] = [a[1]!, a[0]!];
  return a;
}

/* ---------- vista previa web ---------- */
const G = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";
export function demoTitles(): Title[] {
  const raw: [string, Kind, [string, string][]][] = [
    ["Big Buck Bunny", "movie", [["Big Buck Bunny", "BigBuckBunny.mp4"]]],
    ["Sintel", "anime", [["Sintel", "Sintel.mp4"]]],
    ["Tears of Steel", "movie", [["Tears of Steel", "TearsOfSteel.mp4"]]],
    ["Elephants Dream", "movie", [["Elephants Dream", "ElephantsDream.mp4"]]],
    [
      "Cortos Google",
      "series",
      [
        ["S01E01 For Bigger Blazes", "ForBiggerBlazes.mp4"],
        ["S01E02 For Bigger Escapes", "ForBiggerEscapes.mp4"],
        ["S01E03 For Bigger Fun", "ForBiggerFun.mp4"],
        ["S02E01 For Bigger Joyrides", "ForBiggerJoyrides.mp4"],
        ["S02E02 For Bigger Meltdowns", "ForBiggerMeltdowns.mp4"],
        ["S02E03 Subaru Outback", "SubaruOutbackOnStreetAndDirt.mp4"],
      ],
    ],
    [
      "Clips de coches",
      "series",
      [
        ["We Are Going On Bullrun", "WeAreGoingOnBullrun.mp4"],
        ["What Car Can You Get", "WhatCarCanYouGetForAGrand.mp4"],
        ["Volkswagen GTI Review", "VolkswagenGTIReview.mp4"],
      ],
    ],
  ];
  return raw.map(([name, kind, eps], i) =>
    buildTitle({
      id: `demo-${i}`,
      name,
      kindHint: kind,
      files: eps.map(([n, f], k) => ({
        rel: `${n}.mp4`,
        name: n,
        url: G + f,
        mtime: Date.now() - (i * 10 + k) * 3600_000,
      })),
    }),
  );
}

async function srtToVtt(file: File) {
  const t = await file.text();
  const v =
    "WEBVTT\n\n" +
    t
      .replace(/^\uFEFF/, "")
      .replace(/\r/g, "")
      .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2");
  return URL.createObjectURL(new Blob([v], { type: "text/vtt" }));
}

/** Navegador: carpeta elegida con <input webkitdirectory>. Cada subcarpeta = un título. */
export async function titlesFromFiles(files: FileList): Promise<Title[]> {
  const VIDEO = /\.(mp4|m4v|webm|mkv|mov|ogv)$/i,
    SUB = /\.(vtt|srt)$/i;
  const groups = new Map<string, File[]>();
  for (const f of Array.from(files)) {
    const parts = (f.webkitRelativePath || f.name).split("/");
    const key = parts.length >= 3 ? parts[1]! : parts[parts.length - 1]!.replace(/\.[^.]+$/, "");
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out: Title[] = [];
  for (const [name, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const subs = list.filter((f) => SUB.test(f.name));
    const vids = list.filter((f) => VIDEO.test(f.name));
    if (!vids.length) continue;
    const mapped = [];
    for (const v of vids) {
      const base = v.name.replace(/\.[^.]+$/, "");
      const ss: SubSource[] = [];
      for (const s of subs.filter((s) => s.name.startsWith(base)))
        ss.push({
          label:
            s.name
              .slice(base.length)
              .replace(/^[._-]/, "")
              .replace(/\.[^.]+$/, "") || "Externo",
          url: s.name.endsWith(".srt") ? await srtToVtt(s) : URL.createObjectURL(s),
        });
      mapped.push({
        rel: (v.webkitRelativePath || v.name).split("/").slice(2).join("/") || v.name,
        name: v.name,
        url: URL.createObjectURL(v),
        mtime: v.lastModified,
        subtitles: ss,
      });
    }
    out.push(buildTitle({ id: `f-${hash(name)}`, name, kindHint: null, files: mapped }));
  }
  return out;
}

export async function titlesFromBridge(root: string): Promise<Title[]> {
  const res = await window.nofufa!.scan(root);
  return res.map((s) =>
    buildTitle({
      id: `d-${hash(s.dir)}`,
      name: s.name,
      kindHint: s.kindHint,
      files: s.files,
      images: s.images,
      info: s.info,
    }),
  );
}

/** Escritorio: todas las carpetas de biblioteca a la vez. */
export async function titlesFromRoots(roots: string[]): Promise<Title[]> {
  const b = window.nofufa!;
  const res = b.scanAll ? await b.scanAll(roots) : (await Promise.all(roots.map((r) => b.scan(r)))).flat();
  return res.map((s) =>
    buildTitle({
      id: `d-${hash(s.dir)}`,
      name: s.name,
      kindHint: s.kindHint,
      files: s.files,
      images: s.images,
      info: s.info,
    }),
  );
}
