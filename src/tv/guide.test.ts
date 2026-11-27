import { describe, expect, it } from "vitest";
import { liveChannels } from "./Guide";
import type { Title } from "./types";

const t = (id: string, name: string, kind: Title["kind"] = "movie") =>
  ({ id, name, kind, episodes: [{ id: id + "e" }] }) as unknown as Title;

describe("liveChannels", () => {
  it("une las películas de Dragon Ball Z y Super en un solo canal", () => {
    const out = liveChannels([t("a", "Dragon Ball Z La batalla de los dioses"), t("b", "Dragon Ball Super Broly"), t("c", "Naruto", "anime")]);
    expect(out).toHaveLength(2);
    expect(out[0]!.episodes).toHaveLength(2);
  });
});
