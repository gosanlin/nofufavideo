import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import type { Episode, Title } from "./types";
import { cleanName } from "./library";

export const KIND_LABEL = {
  series: "Serie",
  movie: "Película",
  anime: "Anime",
  video: "Vídeo",
} as const;

export function poster(t: Title) {
  return t.images?.poster ?? t.images?.folder ?? t.images?.cover ?? t.meta?.poster;
}
export function backdrop(t: Title) {
  return t.images?.fanart ?? t.images?.background ?? t.meta?.background ?? poster(t);
}

/* ---------- miniaturas de episodio (cola con 2 a la vez) ---------- */
const thumbCache = new Map<string, Promise<string | null>>();
let running = 0;
const queue: (() => void)[] = [];
function runQueued<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((res, rej) => {
    const go = () => {
      running++;
      fn()
        .then(res, rej)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < 2) go();
    else queue.push(go);
  });
}
export function useThumb(ep?: Episode, fallback?: string) {
  const [url, setUrl] = useState<string | undefined>(fallback);
  useEffect(() => {
    setUrl(fallback);
    if (!ep?.path || !window.nofufa || fallback) return;
    let alive = true;
    if (!thumbCache.has(ep.path))
      thumbCache.set(
        ep.path,
        runQueued(() => window.nofufa!.thumb(ep.path!)),
      );
    thumbCache.get(ep.path)!.then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [ep?.path, fallback]);
  return url;
}

export function Art({
  src,
  alt,
  className = "",
  bare = false,
  onError,
}: {
  src?: string | undefined;
  alt: string;
  className?: string;
  bare?: boolean;
  onError?: (() => void) | undefined;
}) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || (bad && !onError)) {
    return (
      <div className={`bg-art-fallback grid place-items-center p-3 text-center ${className}`}>
        {!bare && (
          <span className="line-clamp-3 text-lg font-bold uppercase leading-tight tracking-tight text-foreground/80">
            {cleanName(alt)}
          </span>
        )}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => (onError ? onError() : setBad(true))}
      className={`object-cover ${className}`}
    />
  );
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  if (!(value > 0)) return null;
  return (
    <div className={`h-1 overflow-hidden bg-foreground/25 ${className}`}>
      <div className="h-full bg-primary" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function Row({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const sc = useRef<HTMLDivElement>(null);
  const by = (d: number) =>
    sc.current?.scrollBy({ left: d * sc.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className="group/row relative">
      <div className="mb-2 flex items-baseline gap-4 px-12">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      <div
        ref={sc}
        className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth px-12 pb-6 pt-2"
      >
        {children}
      </div>
      <button
        aria-label="Anterior"
        onClick={() => by(-1)}
        className="absolute bottom-6 left-0 top-11 hidden w-11 place-items-center bg-background/60 opacity-0 transition group-hover/row:opacity-100 md:grid"
      >
        <ChevronLeft className="size-8" />
      </button>
      <button
        aria-label="Siguiente"
        onClick={() => by(1)}
        className="absolute bottom-6 right-0 top-11 hidden w-11 place-items-center bg-background/60 opacity-0 transition group-hover/row:opacity-100 md:grid"
      >
        <ChevronRight className="size-8" />
      </button>
    </section>
  );
}

/** Tarjeta horizontal 16:9 estilo Prime. */
export function Card({
  t,
  onOpen,
  sub,
  progress,
  onRemove,
  onPlay,
  thumbEp,
}: {
  t: Title;
  onOpen: () => void;
  sub?: string;
  progress?: number;
  onRemove?: () => void;
  onPlay?: () => void;
  thumbEp?: Episode | undefined;
}) {
  const bg = backdrop(t);
  const th = useThumb(bg ? undefined : thumbEp);
  const img = bg ?? th;
  return (
    <div className="group/card relative w-72 shrink-0">
      <button
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-lg bg-card text-left outline-none ring-primary transition duration-200 focus-visible:ring-4 group-hover/card:scale-[1.04] group-hover/card:shadow-2xl"
      >
        <div className="relative aspect-video">
          <Art src={img} alt={t.meta?.title ?? t.name} className="absolute inset-0 size-full" />
          <div className="bg-card-fade absolute inset-0 opacity-0 transition group-hover/card:opacity-100" />
          <p className="absolute bottom-2 left-3 right-3 truncate text-sm font-bold opacity-0 transition group-hover/card:opacity-100">
            {t.meta?.title ?? t.name}
          </p>
        </div>
        <Progress value={progress ?? 0} />
      </button>
      {sub && <p className="mt-2 truncate text-sm text-muted-foreground">{sub}</p>}
      {onPlay && (
        <button
          onClick={onPlay}
          aria-label="Reproducir"
          className="absolute left-3 top-3 grid size-10 place-items-center rounded-full bg-foreground text-background opacity-0 transition group-hover/card:opacity-100"
        >
          <Play className="size-5 fill-current" />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Quitar de Seguir viendo"
          title="Quitar de Seguir viendo"
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/80 opacity-0 transition hover:bg-destructive group-hover/card:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Póster del título; si no hay carátula usa un fotograma del primer episodio. */
export function PosterArt({ t, className = "" }: { t: Title; className?: string }) {
  const p = poster(t);
  const th = useThumb(p ? undefined : t.episodes[0]);
  return <Art src={p ?? th} alt={t.meta?.title ?? t.name} className={className} />;
}

/** Tarjeta vertical (póster). */
export function PosterCard({ t, onOpen }: { t: Title; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group/card w-44 shrink-0 text-left outline-none">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-card ring-primary transition duration-200 group-hover/card:scale-[1.04] group-focus-visible/card:ring-4">
        <PosterArt t={t} className="absolute inset-0 size-full" />
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{t.meta?.title ?? t.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {KIND_LABEL[t.kind]}
        {t.meta?.year ? ` · ${t.meta.year}` : ""}
      </p>
    </button>
  );
}
