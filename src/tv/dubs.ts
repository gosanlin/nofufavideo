/**
 * Doblajes: un mismo episodio subido varias veces con el idioma en el título
 * ("Serie S01E01 [LAT]", "Serie S01E01 [ESP]") se une en un solo episodio con selector de audio.
 */
export interface Dub {
  /** código corto: LAT, ESP, ENG, JAP, VOSE, DUAL */
  lang: string;
  url: string;
  duration?: number | undefined;
  /** todos los servidores/mirrors disponibles para este idioma */
  servers?: string[] | undefined;
  /** alias de servers */
  mirrors?: string[] | undefined;
}

export const DUB_LABELS: Record<string, string> = {
  LAT: "Español Latino",
  ESP: "Español España",
  ENG: "Inglés",
  JAP: "Japonés",
  VOSE: "V.O. subtitulada",
  DUAL: "Dual",
};
/** orden fijo cuando no hay preferencia */
export const DUB_ORDER = ["LAT", "ESP", "DUAL", "ENG", "JAP", "VOSE"];
export const dubLabel = (lang: string) => DUB_LABELS[lang] ?? lang;

const WORDS: [string, RegExp][] = [
  ["VOSE", /^(vose|vos|sub(?:titulado)?s?[ ._-]*esp(?:a[nñ]ol)?|subesp)$/i],
  ["LAT", /^(lat|latino|latam|es[ ._-]?la|es[ ._-]?419|esp(?:a[nñ]ol)?[ ._-]*latino)$/i],
  ["ESP", /^(esp|es|cast|castellano|es[ ._-]?es|esp(?:a[nñ]ol)?[ ._-]*(?:espa[nñ]a|castellano)|spain)$/i],
  ["ENG", /^(eng|en|ingl[eé]s|english)$/i],
  ["JAP", /^(jap|jpn|ja|japon[eé]s|japanese)$/i],
  ["DUAL", /^(dual|dual[ ._-]*audio)$/i],
];
const wordLang = (w: string) => WORDS.find(([, r]) => r.test(w.trim()))?.[0];

/**
 * Detecta la etiqueta de idioma del título y devuelve el título sin ella.
 * Solo cuenta si va entre [ ] o ( ), o como última palabra tras un guion ("… - Latino").
 */
export function parseDub(title: string): { lang?: string; title: string } {
  let lang: string | undefined;
  let out = title.replace(/\s*[[(]([^\])]{2,24})[\])]/g, (all, inner: string) => {
    const l = wordLang(inner);
    if (l && !lang) { lang = l; return " "; }
    return all;
  });
  if (!lang) {
    const m = out.match(/\s[-–|]\s*([a-zñé ._-]{2,24})\s*(\.[a-z0-9]{2,4})?$/i);
    const l = m && wordLang(m[1]!);
    if (m && l) { lang = l; out = out.slice(0, m.index) + (m[2] ?? ""); }
  }
  out = out.replace(/\s{2,}/g, " ").replace(/\s+(\.[a-z0-9]{2,4})$/i, "$1").trim();
  return lang ? { lang, title: out } : { title };
}

/** Ordena los doblajes de un episodio con el orden fijo. */
export const sortDubs = (d: Dub[]) =>
  [...d].sort((a, b) => rank(a.lang) - rank(b.lang) || a.lang.localeCompare(b.lang));
const rank = (l: string) => { const i = DUB_ORDER.indexOf(l); return i < 0 ? 99 : i; };

/**
 * Doblaje a reproducir: el elegido para esta serie, si no el preferido en Ajustes,
 * y si el episodio no lo tiene, el primero disponible.
 */
export function pickDub(dubs: Dub[] | undefined, titlePref?: string, globalPref?: string): Dub | undefined {
  if (!dubs?.length) return undefined;
  return (
    (titlePref && dubs.find((d) => d.lang === titlePref)) ||
    (globalPref && dubs.find((d) => d.lang === globalPref)) ||
    sortDubs(dubs)[0]
  );
}
