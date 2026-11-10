const L: Record<string, string> = {
  spa: "Español",
  es: "Español",
  esp: "Español",
  lat: "Español (Latino)",
  eng: "Inglés",
  en: "Inglés",
  jpn: "Japonés",
  ja: "Japonés",
  jap: "Japonés",
  fre: "Francés",
  fra: "Francés",
  fr: "Francés",
  ger: "Alemán",
  deu: "Alemán",
  de: "Alemán",
  ita: "Italiano",
  it: "Italiano",
  por: "Portugués",
  pt: "Portugués",
  kor: "Coreano",
  ko: "Coreano",
  chi: "Chino",
  zho: "Chino",
  rus: "Ruso",
  cat: "Catalán",
  und: "",
};
export const langName = (code?: string) =>
  code ? (L[code.toLowerCase()] ?? code.toUpperCase()) : "";
export const sameLang = (a?: string, b?: string) =>
  !!a && !!b && (langName(a) === langName(b) || a.toLowerCase().startsWith(b.toLowerCase()));

const WORDS: Record<string, string[]> = {
  Español: ["español", "espanol", "castellano", "spanish", "latino", "spa"],
  Inglés: ["inglés", "ingles", "english", "eng"],
  Japonés: ["japonés", "japones", "japanese", "jpn"],
};
/** ¿Esta pista (código de idioma + título) es del idioma pedido? */
export const matchLang = (want: string, lang?: string, title?: string) => {
  if (!want) return false;
  if (sameLang(lang, want)) return true;
  const n = langName(want);
  const t = (title ?? "").toLowerCase();
  return !!t && (WORDS[n] ?? [n.toLowerCase()]).some((w) => w && t.includes(w));
};
