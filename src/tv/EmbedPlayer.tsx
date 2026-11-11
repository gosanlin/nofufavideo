import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, SkipBack, SkipForward } from "lucide-react";
import type { Episode, Title } from "./types";
import { episodeTitle } from "./library";
import { embedSrc } from "./lulu";

interface Props {
  title: Title;
  episode: Episode;
  next?: Episode | undefined;
  prev?: Episode | undefined;
  startAt?: number;
  broadcast?: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
  onRandom: () => void;
  hidden?: boolean | undefined;
}

/**
 * Permisos del iframe. El embed de LuluStream redirige a otro dominio (lulustream.com → luluvid.com),
 * así que "fullscreen" a secas (limitado al origen del src) bloqueaba la pantalla completa.
 * Con "*" el permiso sigue al reproductor tras la redirección.
 */
export const EMBED_ALLOW =
  "autoplay *; fullscreen *; encrypted-media *; picture-in-picture *";

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

/** Reproductor para streams de Luluvido (iframe embed). */
export function EmbedPlayer({
  title,
  episode,
  next,
  prev,
  startAt = 0,
  broadcast = false,
  onClose,
  onNext,
  onPrev,
  hidden,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const [bar, setBar] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toggleFs = useCallback(async () => {
    const d = document as FsDoc;
    try {
      if (fsElement()) await (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      else {
        const el = box.current as FsEl | null;
        if (!el) return;
        await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* el navegador lo ha denegado */
    }
  }, []);

  // en pantalla completa la barra superior se oculta sola y reaparece al acercar el ratón arriba
  const showBar = useCallback(() => {
    setBar(true);
    clearTimeout(hideTimer.current);
    if (fsElement()) hideTimer.current = setTimeout(() => setBar(false), 3000);
  }, []);

  useEffect(() => {
    const h = () => {
      const on = !!fsElement();
      setFs(on);
      showBar();
      if (!on) clearTimeout(hideTimer.current);
    };
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("webkitfullscreenchange", h);
      clearTimeout(hideTimer.current);
    };
  }, [showBar]);

  // al cerrar el reproductor, salir también de pantalla completa
  useEffect(
    () => () => {
      if (fsElement() && box.current?.contains(fsElement())) document.exitFullscreen?.().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (hidden) return;
      const key = e.key.toLowerCase();
      if (key === "escape" || key === "backspace") {
        if (!fsElement()) onClose();
      } else if (key === "f") toggleFs();
      else if (key === "n" && next) onNext();
      else if (key === "b" && prev && onPrev) onPrev();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, onNext, onPrev, next, prev, toggleFs, hidden]);

  const btn = "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-overlay-foreground/10";

  return (
    <div
      ref={box}
      className={`fixed inset-0 z-50 flex flex-col bg-scrim text-overlay-foreground ${hidden ? "pointer-events-none invisible" : ""}`}
    >
      {fs && !bar && (
        <div className="absolute inset-x-0 top-0 z-10 h-4" onMouseEnter={showBar} onClick={showBar} />
      )}
      <div
        onMouseMove={showBar}
        className={`flex items-center gap-3 px-4 py-3 ${
          fs ? `absolute inset-x-0 top-0 z-10 bg-scrim/90 transition-opacity duration-300 ${bar ? "opacity-100" : "pointer-events-none opacity-0"}` : ""
        }`}
      >
        <button onClick={onClose} aria-label="Volver" className="rounded-full p-2 hover:bg-overlay-foreground/10">
          <ArrowLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{title.meta?.title ?? title.name}</p>
          {title.episodes.length > 1 && (
            <p className="truncate text-sm opacity-70">
              T{episode.season} · E{episode.number} — {episodeTitle(title, episode)}
            </p>
          )}
        </div>
        {prev && onPrev && (
          <button onClick={onPrev} className={btn} title="Episodio anterior (B)">
            <SkipBack className="size-4" /> Anterior
          </button>
        )}
        {next && (
          <button onClick={onNext} className={btn} title={broadcast ? "Siguiente aleatorio (N)" : "Siguiente episodio (N)"}>
            <SkipForward className="size-4" /> Siguiente
          </button>
        )}
        <button
          onClick={toggleFs}
          aria-label={fs ? "Salir de pantalla completa" : "Pantalla completa"}
          title={fs ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
          className="rounded-full p-2 hover:bg-overlay-foreground/10"
        >
          {fs ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </button>
      </div>
      <iframe
        key={episode.url}
        src={embedSrc(episode.url, startAt, broadcast)}
        title={episodeTitle(title, episode)}
        className="w-full flex-1 border-0"
        allow={EMBED_ALLOW}
        allowFullScreen
        referrerPolicy="origin"
      />
    </div>
  );
}
