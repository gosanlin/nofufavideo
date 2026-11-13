import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmbedPlayer } from "./EmbedPlayer";
import { actions, DEFAULT_SETTINGS, getState } from "./store";
import type { Episode, Title } from "./types";
const episode = { id: "embed-one", titleId: "embed-title", name: "Primero", number: 1, season: 1, url: "https://lulustream.com/e/example", duration: 70 } as Episode;
const next = { ...episode, id: "embed-two", number: 2 };
const title = { id: "embed-title", name: "Prueba", episodes: [episode, next], kind: "series" } as Title;
const mount = (onNext = vi.fn(), onClose = vi.fn()) => render(<EmbedPlayer title={title} episode={episode} next={next} onNext={onNext} onClose={onClose} onRandom={vi.fn()} />);
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("manual episode playback", () => {
  it("never advances an embed when elapsed time exceeds its duration", () => {
    vi.useFakeTimers(); const onNext = vi.fn(); mount(onNext);
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
  it("disables advancement even when old preferences are imported or updated", () => {
    expect(DEFAULT_SETTINGS.autoplayNext).toBe(false);
    actions.importData(JSON.stringify({ settings: { autoplayNext: true } }));
    expect(getState().settings.autoplayNext).toBe(false);
    actions.setSettings({ autoplayNext: true });
    expect(getState().settings.autoplayNext).toBe(false);
  });
});
describe("embed tools", () => {
  it("reloads the iframe, toggles the list and marks watched explicitly", () => {
    mount(); const oldFrame = document.querySelector("iframe");
    fireEvent.click(screen.getByRole("button", { name: "Recargar reproductor" }));
    expect(document.querySelector("iframe")).not.toBe(oldFrame);
    fireEvent.click(screen.getByRole("button", { name: "Guardar en Mi lista" }));
    expect(getState().watchlist).toContain("embed-title");
    fireEvent.click(screen.getByRole("button", { name: "Marcar episodio como visto" }));
    expect(getState().watched["embed-one"]).toBe(true);
  });
  it("closes after the selected 15 minutes without advancing episodes", () => {
    vi.useFakeTimers(); const close = vi.fn(); const nextFn = vi.fn(); mount(nextFn, close);
    fireEvent.change(screen.getByRole("combobox", { name: "Temporizador de cierre" }), { target: { value: "15" } });
    act(() => { vi.advanceTimersByTime(899_000); }); expect(close).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); }); expect(close).toHaveBeenCalledTimes(1); expect(nextFn).not.toHaveBeenCalled();
  });
});
