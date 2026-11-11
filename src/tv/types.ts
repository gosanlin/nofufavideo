export type Kind = "series" | "movie" | "anime" | "video";

export interface EpisodeMeta {
  season: number;
  episode: number;
  name?: string | undefined;
  overview?: string | undefined;
  thumbnail?: string | undefined;
  released?: string | undefined;
}

export interface Meta {
  title: string;
  year: string;
  description: string;
  poster?: string | undefined;
  background?: string | undefined;
  logo?: string | undefined;
  genres: string[];
  cast?: string[] | undefined;
  runtime?: string | undefined;
  rating?: string | undefined;
  episodes?: EpisodeMeta[] | undefined;
  source: "cinemeta" | "anilist" | "local";
  kind?: Kind | undefined;
  malId?: number | undefined;
  /** ids externos para Trakt/AniList */
  imdbId?: string | undefined;
  anilistId?: number | undefined;
}

/** Resultado de búsqueda para "Corregir datos" */
export interface MetaCandidate {
  key: string;
  provider: "cinemeta" | "anilist" | "tvmaze" | "kitsu";
  title: string;
  year: string;
  kind: Kind;
  poster?: string | undefined;
  description?: string | undefined;
}

export interface Chapter {
  start: number;
  end: number;
  title: string;
}

export interface Sprite {
  url: string;
  cols: number;
  rows: number;
  interval: number;
  w: number;
  h: number;
}

export interface SubResult {
  provider: "opensubtitles" | "subdl";
  id: string;
  name: string;
  lang: string;
  downloads?: number | undefined;
}

export interface Keys {
  osKey: string;
  subdlKey: string;
  traktId: string;
  traktSecret: string;
  anilistId: string;
  traktUser: boolean;
  anilistUser: boolean;
}

export interface ScrobbleInfo {
  kind: Kind;
  title: string;
  year: string;
  imdbId?: string | undefined;
  anilistId?: number | undefined;
  season: number;
  episode: number;
}

export interface SubSource {
  label: string;
  url: string;
  lang?: string | undefined;
}

export interface Episode {
  id: string;
  titleId: string;
  name: string;
  season: number;
  number: number;
  url: string;
  /** ruta absoluta en disco (solo escritorio) */
  path?: string | undefined;
  subtitles?: SubSource[] | undefined;
  added?: number | undefined;
  /** duración en segundos, si se conoce (p. ej. LuluStream) */
  duration?: number | undefined;
}

export interface Title {
  id: string;
  name: string;
  kind: Kind;
  episodes: Episode[];
  images?:
    | Partial<Record<"poster" | "fanart" | "background" | "logo" | "folder" | "cover", string>>
    | undefined;
  meta?: Meta | null | undefined;
  added: number;
}

export interface ScannedFile {
  name: string;
  rel: string;
  path: string;
  url: string;
  mtime: number;
  subtitles: SubSource[];
}
export interface ScannedTitle {
  name: string;
  dir: string;
  kindHint: Kind | null;
  files: ScannedFile[];
  images: Record<string, string>;
  info: (Partial<Meta> & { kind?: Kind }) | null;
}

export interface Probe {
  duration: number;
  width: number;
  height: number;
  direct: boolean;
  copyVideo: boolean;
  audio: {
    index: number;
    codec: string;
    lang: string;
    title: string;
    channels: number;
    default: boolean;
  }[];
  chapters?: Chapter[] | undefined;
  subs: {
    index: number;
    codec: string;
    lang: string;
    title: string;
    text: boolean;
    forced: boolean;
  }[];
}

export interface NofufaBridge {
  pickFolder(): Promise<string | null>;
  getRoot(): Promise<string | null>;
  scan(root: string): Promise<ScannedTitle[]>;
  probe(path: string): Promise<Probe | null>;
  thumb(path: string, duration?: number): Promise<string | null>;
  stopStream(): Promise<void>;
  reveal(path: string): Promise<void>;
  /** base http://127.0.0.1:puerto/token del servidor local de vídeo */
  mediaBase?: string;
  lastError?(): Promise<string>;
  intro?(path: string, others: string[]): Promise<{ s: number; e: number } | null>;
  translate?(text: string): Promise<{ text: string; lang: string } | null>;
  getRoots?(): Promise<string[]>;
  addRoot?(): Promise<string[] | null>;
  removeRoot?(root: string): Promise<string[]>;
  scanAll?(roots: string[]): Promise<ScannedTitle[]>;
  seekSprite?(path: string, duration: number): Promise<Sprite | null>;
  subsSearch?(q: {
    query: string;
    season?: number | undefined;
    episode?: number | undefined;
    imdbId?: string | undefined;
    movie: boolean;
  }): Promise<{ results: SubResult[]; errors: string[] }>;
  subsDownload?(r: SubResult, video: string): Promise<SubSource | null>;
  getKeys?(): Promise<Keys>;
  setKeys?(k: Partial<Keys>): Promise<Keys>;
  traktStart?(): Promise<{ user_code: string; verification_url: string } | { error: string }>;
  anilistLogin?(): Promise<boolean>;
  logout?(service: "trakt" | "anilist"): Promise<Keys>;
  scrobble?(i: ScrobbleInfo): Promise<{ trakt?: boolean; anilist?: boolean }>;
}

declare global {
  interface Window {
    nofufa?: NofufaBridge | undefined;
  }
}
