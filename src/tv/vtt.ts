export interface Cue {
  start: number;
  end: number;
  text: string;
}

function ts(s: string) {
  const p = s.trim().replace(",", ".").split(":").map(Number);
  return p.length === 3 ? p[0]! * 3600 + p[1]! * 60 + p[2]! : p[0]! * 60 + (p[1] ?? 0);
}

/** Parser mínimo de WebVTT/SRT → cues con texto plano (sin etiquetas ASS/HTML). */
export function parseVtt(src: string): Cue[] {
  const out: Cue[] = [];
  const blocks = src
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = lines[i]!.split("-->");
    const text = lines
      .slice(i + 1)
      .join("\n")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/\\N/gi, "\n")
      .replace(/<(?!\/?(i|b|u)>)[^>]+>/g, "")
      .trim();
    if (text) out.push({ start: ts(a!), end: ts(z!.trim().split(/\s+/)[0]!), text });
  }
  return out.sort((x, y) => x.start - y.start);
}

export function activeCues(cues: Cue[], t: number) {
  return cues.filter((c) => c.start <= t && c.end >= t);
}
