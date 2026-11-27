import { describe, expect, it, vi, afterEach } from "vitest";
import { fromApi, mergeVideos } from "./lulu";

afterEach(() => vi.restoreAllMocks());

describe("catálogo LuluStream", () => {
  it("recorre todas las páginas aunque una traiga menos vídeos", async () => {
    const pages = [[{ file_code: "a" }, { file_code: "b" }], [{ file_code: "nuevo" }]];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const p = Number(new URL(u).searchParams.get("page"));
      return new Response(JSON.stringify({ status: 200, result: { pages: 2, files: pages[p - 1] } }));
    }));
    const list = await fromApi("k");
    expect(list.map((v) => v.code)).toEqual(["a", "b", "nuevo"]);
  });
  it("combina la API en directo con videos.json sin repetir", () => {
    const r = mergeVideos([{ code: "n", title: "Nuevo" }], [{ code: "n", title: "Viejo" }, { code: "x", title: "X" }]);
    expect(r.map((v) => v.title)).toEqual(["Nuevo", "X"]);
  });
});

describe("pasarelas", () => {
  afterEach(() => vi.restoreAllMocks());
  it("nunca llama a la API de LuluStream directamente (no permite CORS)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify({ status: 200, result: { pages: 1, files: [] } }));
    }));
    await fromApi("k");
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => !u.startsWith("https://api.lulustream.com"))).toBe(true);
  });
});

import { parseLength } from "./lulu";
import { test as t2, expect as e2 } from "vitest";
t2("duración de LuluStream en segundos o hh:mm:ss", () => {
  e2(parseLength("1500")).toBe(1500);
  e2(parseLength("01:02:03")).toBe(3723);
  e2(parseLength("")).toBeUndefined();
});
