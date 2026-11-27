import { describe, expect, it } from "vitest";
import { parseEpisode, seasonsOf, slugMap, buildTitle } from "./library";

describe("temporada 0 / especiales", () => {
  it("S00E12 es la temporada 0", () => {
    expect(parseEpisode("Adventure Time - S00E12.mp4", 0)).toMatchObject({ season: 0, number: 12 });
  });
  it("carpeta Specials o Season 00 es la temporada 0", () => {
    expect(parseEpisode("Specials/Episodio 3.mp4", 0)).toMatchObject({ season: 0 });
    expect(parseEpisode("Season 00/Episodio 3.mp4", 0)).toMatchObject({ season: 0 });
  });
  it("especiales aparecen como temporada aparte, al final", () => {
    const t = buildTitle({
      id: "x", name: "Adventure Time", kindHint: "series",
      files: ["Adventure Time - S01E01.mp4", "Adventure Time - S00E12.mp4", "Adventure Time - S02E01.mp4"].map((r) => ({ rel: r, name: r, url: r })),
    });
    expect(seasonsOf(t)).toEqual([1, 2, 0]);
  });
});

describe("URL con el nombre del título", () => {
  it("usa el nombre y evita repetidos", () => {
    const m = slugMap([{ id: "lulu-a", name: "Adventure Time" }, { id: "lulu-b", name: "Adventure Time" }, { id: "lulu-c", name: "Pokémon: La Película" }]);
    expect(m.get("lulu-a")).toBe("adventure-time");
    expect(m.get("lulu-b")).toBe("adventure-time-2");
    expect(m.get("lulu-c")).toBe("pokemon-la-pelicula");
  });
});
