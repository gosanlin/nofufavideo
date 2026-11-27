/** Limpieza de nombres de carpeta y puntuación de coincidencias para buscar carátulas. */

export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

const NOISE =
  /\b(s\d{1,2}(e\d{1,3})?|season\s*\d+|temporada\s*\d+|temp\s*\d+|\d+(st|nd|rd|th)\s+season|complete|completa|completo|serie completa|batch|bd|bdrip|bluray|brrip|web-?dl|webrip|hdtv|dvdrip|remux|dual( audio)?|multi|castellano|latino|vose|vos|sub ?esp\w*|subtitulado|esp|eng|jap|1080p|720p|480p|2160p|4k|uhd|x26[45]|h26[45]|hevc|10bit|aac|ac3|dts|proper|extended|uncut|imax|remastered|hd)\b/gi;

export interface Query {
  text: string;
  year?: number | undefined;
}

/** Devuelve el título limpio y el año (si aparece en el nombre). */
export function parseQuery(raw: string): Query {
  const ym =
    raw.match(/[([]\s*((?:19|20)\d{2})\s*[)\]]/) ?? raw.match(/[\s._-]((?:19|20)\d{2})(?!\d)/);
  const year = ym ? +ym[1]! : undefined;
  const text = raw
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/[._]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\s+-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return { text: text || raw.trim(), year };
}

/** Variantes de búsqueda de la más específica a la más general. */
export function queryVariants(raw: string): Query[] {
  const q = parseQuery(raw);
  const out: Query[] = [q];
  const head = q.text.split(/\s+[-–:]\s+|:\s*/)[0]!.trim();
  if (head && head !== q.text && head.length >= 3) out.push({ text: head, year: q.year });
  const noThe = q.text
    .replace(/\b(the movie|la pelicula|la película|movie|pelicula|película)\b/gi, "")
    .trim();
  if (noThe && noThe !== q.text) out.push({ text: noThe, year: q.year });
  const seen = new Set<string>();
  return out.filter((v) => {
    const k = fold(v.text);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 0-100. Tolera subtítulos, artículos, acentos y un año distinto en un par de años. */
export function score(q: string, c: string, qYear?: number, cYear?: number) {
  const a = fold(q),
    b = fold(c);
  if (!a || !b) return 0;
  let s: number;
  if (a === b) s = 100;
  else {
    const ta = a.split(" "),
      tb = b.split(" ");
    const sb = new Set(tb),
      sa = new Set(ta);
    const hit = ta.filter((t) => sb.has(t)).length;
    const dice = (2 * hit) / (sa.size + sb.size);
    const contained = ` ${b} `.includes(` ${a} `) || ` ${a} `.includes(` ${b} `);
    s = contained && Math.min(ta.length, tb.length) >= 1 ? Math.max(75, dice * 90) : dice * 90;
  }
  if (qYear && cYear) s += Math.abs(qYear - cYear) <= 1 ? 8 : -15;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export const MIN_SCORE = 60;
