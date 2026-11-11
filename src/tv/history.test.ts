import { describe, expect, it } from "vitest";
import { actions, getState, pushHistory, HISTORY_MAX } from "./store";
import { dayLabel } from "./History";

describe("historial", () => {
  it("un episodio vuelto a ver sube al principio sin duplicarse", () => {
    const h = pushHistory(pushHistory([], { epId: "a", titleId: "t", at: 1, t: 1, d: 10 }), { epId: "b", titleId: "t", at: 2, t: 1, d: 10 });
    const r = pushHistory(h, { epId: "a", titleId: "t", at: 3, t: 5, d: 10 });
    expect(r.map((x) => x.epId)).toEqual(["a", "b"]);
  });
  it("guarda como máximo 500 entradas", () => {
    let h: ReturnType<typeof pushHistory> = [];
    for (let i = 0; i < 510; i++) h = pushHistory(h, { epId: String(i), titleId: "t", at: i, t: 0, d: 1 });
    expect(h.length).toBe(HISTORY_MAX);
  });
  it("con el historial en pausa no se guarda progreso", () => {
    actions.setSettings({ pauseHistory: true });
    actions.setProgress("x", "t", 10, 100);
    expect(getState().progress["x"]).toBeUndefined();
    actions.setSettings({ pauseHistory: false });
    actions.setProgress("x", "t", 10, 100);
    expect(getState().progress["x"]?.t).toBe(10);
  });
  it("se marca visto según el % elegido en Ajustes", () => {
    actions.setSettings({ doneAt: 85 });
    actions.setProgress("y", "t", 86, 100);
    expect(getState().watched["y"]).toBe(true);
  });
  it("Hoy / Ayer", () => {
    const now = new Date(2026, 10, 11, 12).getTime();
    expect(dayLabel(now - 3600e3, now)).toBe("Hoy");
    expect(dayLabel(now - 86400e3, now)).toBe("Ayer");
  });
});
