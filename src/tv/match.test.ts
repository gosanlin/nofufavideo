import { describe, expect, it } from "vitest";
import { parseQuery, queryVariants, score, MIN_SCORE } from "./match";

describe("limpieza de nombres para carátulas", () => {
  it("quita año, corchetes y calidad", () => {
    expect(parseQuery("Dune (2021)")).toEqual({ text: "Dune", year: 2021 });
    expect(parseQuery("[Grupo] Frieren [1080p] [Dual]").text).toBe("Frieren");
    expect(parseQuery("Breaking.Bad.S01.1080p.BluRay.x265").text).toBe("Breaking Bad");
    expect(parseQuery("Attack on Titan Temporada 2").text).toBe("Attack on Titan");
  });
  it("genera variante sin subtítulo", () => {
    expect(queryVariants("Fate - Stay Night (2006)").map((v) => v.text)).toEqual([
      "Fate - Stay Night",
      "Fate",
    ]);
  });
});

describe("puntuación", () => {
  it("acepta coincidencias razonables", () => {
    expect(score("Dune", "Dune", 2021, 2021)).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(score("Frieren", "Frieren: Beyond Journey's End")).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(score("Pokémon", "Pokemon")).toBe(100);
  });
  it("rechaza títulos distintos", () => {
    expect(score("Dune", "Dune Messiah Documentary Extras Collection")).toBeLessThan(100);
    expect(score("Naruto", "Bleach")).toBeLessThan(MIN_SCORE);
  });
});
