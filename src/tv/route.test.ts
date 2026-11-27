import { describe, expect, it } from "vitest";
import { hashFromView, viewFromHash } from "./App";
describe("ruta en la URL", () => {
  it("F5 mantiene la página", () => {
    expect(viewFromHash("#/series")).toEqual({ page: "series" });
    expect(viewFromHash(hashFromView({ page: "title", id: "lulu-ab c" }))).toEqual({ page: "title", id: "lulu-ab c" });
    expect(viewFromHash("")).toEqual({ page: "home" });
  });
});
