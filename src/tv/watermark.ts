/**
 * Calcula el círculo de la marca de canal (estilo Boing) dentro del área REAL
 * del vídeo (object-fit: contain), no del contenedor. Así el logo queda en el
 * mismo sitio relativo en 4:3, 16:9 o 21:9, aunque haya bandas negras.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const WATERMARK_SIZE = 0.09; // diámetro = 9% del alto del vídeo
export const WATERMARK_MARGIN = 0.045; // margen = 4.5% del alto del vídeo

export function contentRect(boxW: number, boxH: number, videoW: number, videoH: number): Rect {
  if (!videoW || !videoH || !boxW || !boxH) return { left: 0, top: 0, width: boxW, height: boxH };
  const scale = Math.min(boxW / videoW, boxH / videoH);
  const width = videoW * scale;
  const height = videoH * scale;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height };
}

export function watermarkRect(boxW: number, boxH: number, videoW: number, videoH: number) {
  const c = contentRect(boxW, boxH, videoW, videoH);
  const size = c.height * WATERMARK_SIZE;
  const margin = c.height * WATERMARK_MARGIN;
  return {
    size,
    left: c.left + c.width - margin - size,
    top: c.top + margin,
  };
}
