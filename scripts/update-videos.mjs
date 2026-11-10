// Descarga TODA la lista de vídeos de LuluStream y la guarda en public/videos.json (GitHub Actions, sin CORS).
import { writeFileSync } from "node:fs";
const KEY = process.env.LULU_API_KEY;
if (!KEY) { console.error("Falta el secreto LULU_API_KEY"); process.exit(1); }
const all = [];
const seen = new Set();
for (let page = 1; page <= 200; page++) {
  const r = await fetch(`https://api.lulustream.com/api/file/list?key=${KEY}&per_page=100&page=${page}&_=${Date.now()}`);
  const j = await r.json();
  if (j.status !== 200) { console.error("LuluStream respondió:", j.msg); process.exit(1); }
  const files = j.result?.files || [];
  for (const f of files) {
    if (!f.file_code || seen.has(f.file_code)) continue;
    seen.add(f.file_code);
    all.push({ title: f.title || f.file_code, code: f.file_code, thumb: f.thumbnail || "", length: f.length || "", uploaded: f.uploaded || "" });
  }
  const pages = Number(j.result?.pages) || 0;
  // recorre todas las páginas que indica la API (antes se paraba antes de tiempo y faltaban vídeos)
  if (!files.length || (pages ? page >= pages : files.length < 100)) break;
}
all.sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded)));
writeFileSync("public/videos.json", JSON.stringify(all, null, 2));
console.log(`OK: ${all.length} vídeos guardados`);
