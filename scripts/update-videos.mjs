// Descarga la lista de videos de Luluvido y la guarda en videos.json (se ejecuta en GitHub Actions, sin CORS).
import { writeFileSync } from "node:fs";
const KEY = process.env.LULU_API_KEY;
if (!KEY) { console.error("Falta el secreto LULU_API_KEY"); process.exit(1); }
const all = [];
for (let page = 1; page <= 50; page++) {
  const r = await fetch(`https://api.lulustream.com/api/file/list?key=${KEY}&per_page=200&page=${page}`);
  const j = await r.json();
  if (j.status !== 200) { console.error("Luluvido respondió:", j.msg); process.exit(1); }
  const files = j.result?.files || [];
  for (const f of files) all.push({ title: f.title || f.file_code, code: f.file_code, thumb: f.thumbnail || "", length: f.length || "" });
  if (files.length < 200) break;
}
writeFileSync("public/videos.json", JSON.stringify(all, null, 2));
console.log(`OK: ${all.length} videos guardados`);
