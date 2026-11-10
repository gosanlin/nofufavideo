import { describe, expect, it } from "vitest";
import {
  buildTitle,
  detectKind,
  episodeTitle,
  parseEpisode,
  shuffleQueue,
  tidyEpisodeName,
} from "./library";

describe("detección de temporadas y episodios", () => {
  it("lee S02E05", () => {
    expect(parseEpisode("Serie.S02E05.Nombre.1080p.mkv", 0)).toMatchObject({
      season: 2,
      number: 5,
    });
  });
  it("lee 1x07", () => {
    expect(parseEpisode("Serie 1x07 - Algo.mp4", 0)).toMatchObject({ season: 1, number: 7 });
  });
  it("toma la temporada de la carpeta", () => {
    expect(parseEpisode("Temporada 3/Episodio 4.mkv", 0)).toMatchObject({ season: 3, number: 4 });
  });
  it("anime con guion y número", () => {
    expect(parseEpisode("[Grupo] Anime - 12 [1080p].mkv", 0)).toMatchObject({
      season: 1,
      number: 12,
    });
  });
  it("sin número usa el orden", () => {
    expect(parseEpisode("Película.mkv", 2)).toMatchObject({ season: 1, number: 3 });
  });
});

describe("tipo de contenido", () => {
  it("un solo vídeo es película y varios es serie", () => {
    expect(detectKind({ name: "X", kindHint: null, count: 1 })).toBe("movie");
    expect(detectKind({ name: "X", kindHint: null, count: 8 })).toBe("series");
  });
  it("la carpeta Anime manda", () => {
    expect(detectKind({ name: "X", kindHint: "anime", count: 8 })).toBe("anime");
  });
});

describe("emisión aleatoria", () => {
  it("no repite ningún episodio hasta agotar la lista", () => {
    const q = shuffleQueue([1, 2, 3, 4, 5, 6]);
    expect([...q].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("no empieza por el episodio que se acaba de ver", () => {
    for (let i = 0; i < 30; i++) expect(shuffleQueue([1, 2, 3], Math.random, 1)[0]).not.toBe(1);
  });
});

describe("nombres de episodio", () => {
  it("sin nombre propio muestra 'Episodio N' y no el de la serie", () => {
    const p = parseEpisode("Season 01/Dragon Ball Z - S01E145.mkv", 0);
    expect(tidyEpisodeName(p.name, "Dragon Ball Z (1989)", p.number)).toBe("Episodio 145");
  });
  it("conserva el nombre real del archivo", () => {
    const p = parseEpisode("Serie - S01E02 - El regreso.mkv", 0);
    expect(tidyEpisodeName(p.name, "Serie", p.number)).toBe("El regreso");
  });
  it("numeración absoluta encuentra los datos por posición", () => {
    const t = buildTitle({
      id: "x",
      name: "Show",
      kindHint: "anime",
      files: [{ rel: "Show - S01E03.mkv", name: "a", url: "u" }],
    });
    t.meta = {
      title: "Show",
      year: "",
      description: "",
      genres: [],
      source: "cinemeta",
      episodes: [
        { season: 1, episode: 1, name: "Uno" },
        { season: 1, episode: 2, name: "Dos" },
        { season: 2, episode: 1, name: "Tres" },
      ],
    };
    expect(episodeTitle(t, t.episodes[0]!)).toBe("Tres");
  });
});
