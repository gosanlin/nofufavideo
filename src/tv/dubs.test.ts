import { describe, expect, it } from "vitest";
import { parseDub, pickDub } from "./dubs";
import { titlesFromLulu } from "./lulu";

describe("etiquetas de doblaje", () => {
  it("reconoce latino y castellano entre corchetes o paréntesis", () => {
    expect(parseDub("Serie S01E01 [LAT]")).toEqual({ lang: "LAT", title: "Serie S01E01" });
    expect(parseDub("Serie S01E01 (Castellano)")).toEqual({ lang: "ESP", title: "Serie S01E01" });
    expect(parseDub("Película [VOSE].mp4")).toEqual({ lang: "VOSE", title: "Película.mp4" });
  });
  it("reconoce el idioma al final tras un guion", () => {
    expect(parseDub("Serie 1x02 - Latino")).toEqual({ lang: "LAT", title: "Serie 1x02" });
  });
  it("no toca títulos sin etiqueta ni palabras del propio nombre", () => {
    expect(parseDub("Los Latinos S01E01")).toEqual({ title: "Los Latinos S01E01" });
    expect(parseDub("Serie S01E01 [1080p]")).toEqual({ title: "Serie S01E01 [1080p]" });
  });
});

describe("elegir doblaje", () => {
  const dubs = [{ lang: "ESP", url: "e" }, { lang: "LAT", url: "l" }];
  it("lo elegido en la serie manda sobre Ajustes", () => {
    expect(pickDub(dubs, "ESP", "LAT")?.url).toBe("e");
  });
  it("usa Ajustes si la serie no tiene elección", () => {
    expect(pickDub(dubs, undefined, "ESP")?.url).toBe("e");
  });
  it("sin preferencia válida usa Latino antes que España", () => {
    expect(pickDub(dubs, "JAP", "ENG")?.url).toBe("l");
  });
});

describe("catálogo con doblajes", () => {
  it("une las versiones del mismo episodio en uno solo", () => {
    const [t] = titlesFromLulu([
      { code: "a", title: "Mi Serie S01E01 [LAT]" },
      { code: "b", title: "Mi Serie S01E01 [ESP]" },
      { code: "c", title: "Mi Serie S01E02 [LAT]" },
    ]);
    expect(t!.name).toBe("Mi Serie");
    expect(t!.episodes).toHaveLength(2);
    expect(t!.episodes[0]!.dubs?.map((d) => d.lang)).toEqual(["LAT", "ESP"]);
    expect(t!.episodes[1]!.dubs?.map((d) => d.lang)).toEqual(["LAT"]);
  });
  it("une las versiones de una película", () => {
    const list = titlesFromLulu([
      { code: "x", title: "La Película (Latino)" },
      { code: "y", title: "La Película (Castellano)" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]!.episodes[0]!.dubs).toHaveLength(2);
  });
  it("los vídeos sin etiqueta siguen igual", () => {
    const [t] = titlesFromLulu([{ code: "z", title: "Otra S01E01" }]);
    expect(t!.episodes[0]!.dubs).toBeUndefined();
  });
});
