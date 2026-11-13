import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, SkipBack, SkipForward, RefreshCw, ExternalLink, Copy, Check, Bookmark, CheckCircle, RectangleHorizontal, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Episode, Title } from "./types";
import { episodeTitle } from "./library";
import { embedSrc } from "./lulu";
import { actions, useStore } from "./store";

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
  const state = useStore();
  const [reload, setReload] = useState(0);
  const [cinema, setCinema] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepLeft, setSleepLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(episode.url); setCopied(true); }
    catch { setNotice("No se pudo copiar el enlace. Puedes abrirlo en otra pestaña."); }
  };
  useEffect(() => {
    setLoading(true); setNotice(""); setCopied(false); setSleepMinutes(0);
  }, [episode.id]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!sleepMinutes || hidden) { setSleepLeft(0); return; }
    const until = Date.now() + sleepMinutes * 60_000;
    setSleepLeft(sleepMinutes * 60);
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSleepLeft(left);
      if (!left) { clearInterval(timer); closeRef.current(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepMinutes, hidden, episode.id]);
  useEffect(() => {
    if (!loading || hidden) return;
    const timer = setTimeout(() => setNotice("Si el vídeo no aparece, recarga el reproductor o ábrelo aparte."), 12000);
    return () => clearTimeout(timer);
  }, [loading, hidden, reload, episode.id]);

  // Cross-origin playback cannot be measured: never infer completion or advance episodes.

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
      setNotice("Este navegador no permite activar la pantalla completa desde aquí.");
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
      if (e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
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
        className={`flex flex-wrap items-center gap-2 px-3 py-3 ${
          fs ? `absolute inset-x-0 top-0 z-10 bg-scrim/90 transition-opacity duration-300 ${bar ? "opacity-100" : "pointer-events-none opacity-0"}` : ""
        }`}
      >
        <Button variant="player" onClick={onClose} aria-label="Volver" size="icon">
          <ArrowLeft className="size-6" />
        </Button>
        <div className="min-w-0 flex-1 basis-28">
          <p className="truncate text-lg font-bold">{title.meta?.title ?? title.name}</p>
          {title.episodes.length > 1 && (
            <p className="truncate text-sm opacity-70">
              T{episode.season} · E{episode.number} — {episodeTitle(title, episode)}
            </p>
          )}
        </div>
        {prev && onPrev && (
          <Button variant="player" onClick={onPrev} size="sm" title="Episodio anterior (B)">
            <SkipBack className="size-4" /> Anterior
          </Button>
        )}
        {next && (
          <Button variant="player" onClick={onNext} size="sm" title={broadcast ? "Siguiente aleatorio (N)" : "Siguiente episodio (N)"}>
            <SkipForward className="size-4" /> Siguiente
          </Button>
        )}
        <Button variant="player"
          onClick={toggleFs}
          aria-label={fs ? "Salir de pantalla completa" : "Pantalla completa"}
          title={fs ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
          size="icon"
        >
          {fs ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </Button>
      </div>
      <div className={`embed-stage ${cinema && !fs ? "embed-stage-cinema" : ""}`}>
        <iframe
          key={`${episode.id}-${reload}`}
          src={embedSrc(episode.url, startAt, broadcast)}
          title={episodeTitle(title, episode)}
          className="embed-frame"
          allow={EMBED_ALLOW}
          allowFullScreen
          referrerPolicy="origin"
          onLoad={() => { setLoading(false); setNotice(""); }}
          onError={() => { setLoading(false); setNotice("No se pudo cargar el reproductor. Prueba a recargarlo o abrirlo aparte."); }}
        />
        {notice && <div className="embed-notice" role="status">{notice}</div>}
      </div>
      <div className="embed-tools" aria-label="Herramientas del reproductor">
        <Button variant="player" size="icon" aria-label="Recargar reproductor" title="Recargar reproductor" onClick={() => { setLoading(true); setNotice(""); setReload((n) => n + 1); }}><RefreshCw /></Button>
        <Button variant="player" size="icon" aria-label="Modo cine" title="Modo cine" aria-pressed={cinema} onClick={() => setCinema((v) => !v)}><RectangleHorizontal /></Button>
        <Button variant="player" size="icon" asChild><a href={episode.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir reproductor aparte" title="Abrir reproductor aparte"><ExternalLink /></a></Button>
        <Button variant="player" size="icon" aria-label="Copiar enlace" title={copied ? "Enlace copiado" : "Copiar enlace"} onClick={copyLink}>{copied ? <Check /> : <Copy />}</Button>
        <Button variant="player" size="icon" aria-label="Guardar en Mi lista" title="Guardar en Mi lista" aria-pressed={state.watchlist.includes(title.id)} onClick={() => actions.toggleWatchlist(title.id)}><Bookmark /></Button>
        <Button variant="player" size="icon" aria-label="Marcar episodio como visto" title="Marcar episodio como visto" aria-pressed={!!state.watched[episode.id]} onClick={() => actions.setWatched([episode.id], !state.watched[episode.id])}><CheckCircle /></Button>
        <label className="flex items-center gap-2 text-sm"><Timer className="size-4" aria-hidden="true" />
          <select aria-label="Temporizador de cierre" className="embed-timer" value={sleepMinutes} onChange={(e) => setSleepMinutes(Number(e.target.value))}>
            <option value={0}>Sin temporizador</option><option value={15}>Cerrar en 15 min</option><option value={30}>Cerrar en 30 min</option><option value={60}>Cerrar en 60 min</option>
          </select>
        </label>
        {sleepLeft > 0 && <span className="text-sm text-muted-foreground" role="status">{Math.floor(sleepLeft / 60)}:{String(sleepLeft % 60).padStart(2, "0")}</span>}
        {copied && <span role="status" className="text-sm">Enlace copiado</span>}
      </div>
    </div>
  );
}
