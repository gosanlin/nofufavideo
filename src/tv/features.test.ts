import { describe, expect, it } from "vitest";
import {
  allWatched,
  applyOverride,
  clampSync,
  filterTitles,
  resolutionClass,
  shouldScrobble,
  EMPTY_FILTER,
} from "./features";
import type { Meta, Title } from "./types";


const meta = (o: Partial<Meta>): Meta => ({
  title: "X",
  year: "",
  description: "",
  genres: [],
  source: "cinemeta",
  ...o,
});
const title = (id: string, o: Partial<Title> = {}): Title => ({
  id,
  name: id,
  kind: "movie",
  episodes: [],
  added: 0,
  ...o,
});

describe("sincronización ±0,1 s", () => {
  it("redondea a pasos de 0,1 s", () => {
    expect(clampSync(0.1 + 0.2)).toBe(0.3);
    expect(clampSync(-0.04)).toBe(0);
  });
  it("limita a ±10 s", () => {
    expect(clampSync(12)).toBe(10);
    expect(clampSync(-30)).toBe(-10);
  });
});

describe("resolución", () => {
  it("clasifica 4K, 1080p, 720p y SD", () => {
    expect(resolutionClass(2160)).toBe("4k");
    expect(resolutionClass(1080)).toBe("1080p");
    expect(resolutionClass(720)).toBe("720p");
    expect(resolutionClass(480)).toBe("sd");
    expect(resolutionClass(0)).toBe("");
  });
});

describe("filtros de biblioteca", () => {
  const list = [
    title("a", { name: "Alien", meta: meta({ title: "Alien", year: "1979", genres: ["Terror", "Ciencia ficción"] }) }),
    title("b", { name: "Barbie", meta: meta({ title: "Barbie", year: "2023", genres: ["Comedia"] }) }),
    title("c", { name: "Dune", meta: meta({ title: "Dune", year: "2021", genres: ["Ciencia ficción"] }) }),
  ];
  it("filtra por género", () => {
    expect(filterTitles(list, { ...EMPTY_FILTER, genre: "ciencia ficción" }).map((t) => t.id)).toEqual(["a", "c"]);
  });
  it("ordena por nombre A-Z y Z-A", () => {
    expect(filterTitles(list, { ...EMPTY_FILTER, name: "az" }).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(filterTitles(list, { ...EMPTY_FILTER, name: "za" }).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
  it("ordena por fecha nuevo / viejo", () => {
    expect(filterTitles(list, { ...EMPTY_FILTER, date: "new" }).map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(filterTitles(list, { ...EMPTY_FILTER, date: "old" }).map((t) => t.id)).toEqual(["a", "c", "b"]);
  });
  it("añadidos recientemente primero", () => {
    const l = list.map((t, i) => ({ ...t, added: [5, 1, 9][i]! }));
    expect(filterTitles(l, { ...EMPTY_FILTER, recent: true }).map((t) => t.id)).toEqual(["c", "a", "b"]);
  });
});

describe("visto / no visto", () => {
  it("todo visto solo si todos los episodios lo están", () => {
    const eps = [{ id: "1" }, { id: "2" }] as Title["episodes"];
    expect(allWatched(eps, { "1": true })).toBe(false);
    expect(allWatched(eps, { "1": true, "2": true })).toBe(true);
    expect(allWatched([], {})).toBe(false);
  });
});

describe("corregir datos", () => {
  it("la corrección manual sustituye a los datos automáticos", () => {
    const t = title("x", { meta: meta({ title: "Mal" }) });
    expect(applyOverride(t, { x: meta({ title: "Bien" }) }).meta?.title).toBe("Bien");
    expect(applyOverride(t, {}).meta?.title).toBe("Mal");
  });
});

describe("scrobble", () => {
  it("se marca al pasar el 90 %", () => {
    expect(shouldScrobble(89, 100)).toBe(false);
    expect(shouldScrobble(90, 100)).toBe(true);
  });
});
