import { describe, expect, it } from "vitest";
import { watermarkRect } from "./watermark";

describe("marca de canal circular", () => {
  it("16:9 en ventana 16:9 ocupa el 9% del alto, arriba a la derecha", () => {
    const r = watermarkRect(1920, 1080, 1920, 1080);
    expect(r.size).toBeCloseTo(97.2);
    expect(r.top).toBeCloseTo(48.6);
    expect(r.left).toBeCloseTo(1920 - 48.6 - 97.2);
  });

  it("vídeo 4:3 en ventana 16:9 se pega a la imagen, no a las bandas negras", () => {
    const r = watermarkRect(1920, 1080, 640, 480);
    // imagen de 1440 px de ancho centrada: termina en x=1680
    expect(r.left + r.size).toBeCloseTo(1680 - 48.6);
  });

  it("vídeo panorámico deja el logo dentro de la imagen, no en la banda superior", () => {
    const r = watermarkRect(1920, 1080, 1920, 800);
    expect(r.top).toBeCloseTo(140 + 800 * 0.045);
    expect(r.size).toBeCloseTo(72);
  });
});
