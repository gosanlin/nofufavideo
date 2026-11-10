import { useEffect } from "react";
import { ArrowLeft, SkipForward } from "lucide-react";
import type { Episode, Title } from "./types";
import { episodeTitle } from "./library";
import { embedSrc } from "./lulu";

interface Props {
  title: Title;
  episode: Episode;
  next?: Episode | undefined;
  startAt?: number;
  broadcast?: boolean;
  onClose: () => void;
  onNext: () => void;
  onRandom: () => void;
  hidden?: boolean | undefined;
}

/** Reproductor para streams de Luluvido (iframe embed). */
export function EmbedPlayer({ title, episode, next, startAt = 0, broadcast = false, onClose, onNext, onRandom, hidden }: Props) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-scrim text-overlay-foreground ${hidden ? "pointer-events-none invisible" : ""}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
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
        {next && (
          <button onClick={onNext} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-overlay-foreground/10">
            <SkipForward className="size-4" /> Siguiente
          </button>
        )}
      </div>
      <iframe
        key={episode.url}
        src={embedSrc(episode.url, startAt, broadcast)}
        title={episodeTitle(title, episode)}
        className="w-full flex-1 border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="origin"
      />
    </div>
  );
}
