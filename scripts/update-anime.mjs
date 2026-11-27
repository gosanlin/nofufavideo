// Descarga catálogos de anime de vereanimeonline.co, animedlatino.com y jkanime.net
// y guarda public/anime.json (GitHub Actions, sin CORS).
import { writeFileSync } from "node:fs";
import { scrapeAllAnime } from "../src/tv/anime.ts";

const OUT = "public/anime.json";

(async () => {
  console.log("Iniciando scraping de anime...");
  const titles = await scrapeAllAnime({
    animeOnlinePages: 15,
    animeDLatinoPages: 30,
    jkAnimePages: 5,
  });

  // Eliminar duplicados por nombre normalizado
  const seen = new Map<string, any>();
  for (const t of titles) {
    const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!seen.has(key) || t.episodes.length > seen.get(key)!.episodes.length) {
      seen.set(key, t);
    }
  }
  const unique = [...seen.values()];

  // Ordenar por nombre
  unique.sort((a, b) => a.name.localeCompare(b.name));

  writeFileSync(OUT, JSON.stringify(unique, null, 2));
  console.log(`OK: ${unique.length} títulos de anime guardados en ${OUT}`);
})().catch((e) => {
  console.error("Error scrapeando anime:", e);
  process.exit(1);
});
