import { describe, expect, it } from "vitest";
import { langPrefs, type State } from "./store";

const base = (over: Partial<State> = {}): State =>
  ({
    progress: {}, watched: {}, hiddenContinue: {}, watchlist: [], rating: {}, prefs: {},
    settings: { skipIntro: true, autoplayNext: true, audioLang: "jpn", subLang: "spa", showWatermark: true, langAt: 100 },
    ...over,
  }) as State;

describe("langPrefs", () => {
  it("usa los ajustes si el título no tiene elección propia", () => {
    expect(langPrefs(base(), "t")).toEqual({ audio: "jpn", sub: "spa" });
  });
  it("la elección del título manda si es posterior a los ajustes", () => {
    expect(langPrefs(base({ prefs: { t: { audio: "eng", sub: "", at: 200 } } }), "t")).toEqual({ audio: "eng", sub: "" });
  });
  it("cambiar los ajustes después vuelve a mandar", () => {
    expect(langPrefs(base({ prefs: { t: { audio: "eng", sub: "", at: 50 } } }), "t")).toEqual({ audio: "jpn", sub: "spa" });
  });
});
