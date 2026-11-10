import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FolderOpen,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { Episode, Meta, Title } from "./types";
import { FixMeta } from "./FixMeta";
import { allWatched as everyWatched } from "./features";
import { episodeMeta, episodeTitle, seasonsOf } from "./library";
import { actions, useStore } from "./store";
import { Art, KIND_LABEL, Progress, backdrop, useThumb } from "./ui";
import { fmt } from "./Player";

interface Props {
  t: Title;
  onPlay: (ep: Episode, at?: number) => void;
  hasOverride?: boolean;
  onFixMeta?: (m: Meta | null) => void;
}

function IconBtn({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-12 place-items-center rounded-full border-2 transition ${on ? "border-foreground bg-foreground text-background" : "border-foreground/40 bg-background/40 hover:border-foreground"}`}
    >
      {children}
    </button>
  );
}

export function TitlePage({ t, onPlay, hasOverride = false, onFixMeta }: Props) {
  const [fixing, setFixing] = useState(false);
  const s = useStore();
  const seasons = useMemo(() => seasonsOf(t), [t]);
  const resumeEp = useMemo(() => {
    const inProg = t.episodes
      .filter((e) => s.progress[e.id])
      .sort((a, b) => s.progress[b.id]!.at - s.progress[a.id]!.at)[0];
    if (inProg) return inProg;
    const firstUnwatched = t.episodes.find((e) => !s.watched[e.id]);
    return firstUnwatched ?? t.episodes[0]!;
  }, [t, s.progress, s.watched]);
  const [season, setSeason] = useState(resumeEp.season);
  const [tab, setTab] = useState<"episodes" | "details">(
    t.episodes.length > 1 ? "episodes" : "details",
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSeason(resumeEp.season);
    setTab(t.episodes.length > 1 ? "episodes" : "details");
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = t.meta;
  const inList = s.watchlist.includes(t.id);
  const eps = t.episodes.filter((e) => e.season === season);
  const prog = s.progress[resumeEp.id];
  const started = !!prog;
  const allWatched = eps.length > 0 && eps.every((e) => s.watched[e.id]);
  const isMovie = t.episodes.length === 1;
  const titleWatched = everyWatched(t.episodes, s.watched);

  return (
    <div className="pb-20">
      {fixing && onFixMeta && (
        <FixMeta
          t={t}
          hasOverride={hasOverride}
          onClose={() => setFixing(false)}
          onPick={(m) => {
            onFixMeta(m);
            setFixing(false);
          }}
          onReset={() => {
            onFixMeta(null);
            setFixing(false);
          }}
        />
      )}
      <div className="relative min-h-[70vh]">
        <div className="absolute inset-0 overflow-hidden">
          <Art
            src={backdrop(t)}
            alt={t.name}
            className="absolute inset-0 size-full object-top"
            bare
          />
          <div className="bg-hero-fade absolute inset-0" />
        </div>
        <div className="relative flex min-h-[60vh] flex-col justify-end gap-4 px-4 pb-8 pt-24 sm:min-h-[70vh] sm:gap-5 sm:px-8 sm:pb-10 sm:pt-28 lg:px-12">
          {m?.logo ? (
            <img
              src={m.logo}
              alt={m.title}
              className="max-h-32 max-w-md object-contain object-left"
            />
          ) : (
            <h1 className="max-w-3xl text-3xl sm:text-5xl font-extrabold leading-none tracking-tight">
              {m?.title ?? t.name}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground">
            <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs uppercase tracking-wider text-foreground">
              {KIND_LABEL[t.kind]}
            </span>
            {m?.rating && <span className="text-primary-glow">★ {m.rating}</span>}
            {m?.year && <span>{m.year}</span>}
            {!isMovie && (
              <span>
                {seasons.length} {seasons.length === 1 ? "temporada" : "temporadas"}
              </span>
            )}
            {!isMovie && <span>{t.episodes.length} episodios</span>}
            {m?.runtime && <span>{m.runtime}</span>}
          </div>
          {m?.description && (
            <p className="line-clamp-4 max-w-2xl text-lg leading-relaxed">{m.description}</p>
          )}
          {!!m?.genres.length && <p className="text-sm font-semibold">{m.genres.join(" · ")}</p>}
          {!!m?.cast?.length && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              Reparto: <span className="text-foreground">{m.cast.join(", ")}</span>
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onPlay(resumeEp, prog?.t)}
              className="flex h-14 items-center gap-3 rounded-lg bg-foreground px-7 text-lg font-bold text-background transition hover:bg-foreground/85"
            >
              <Play className="size-6 fill-current" />
              {started ? "Reanudar" : "Reproducir"}
              {!isMovie && (
                <span className="font-semibold">
                  T{resumeEp.season} E{resumeEp.number}
                </span>
              )}
            </button>
            {started && (
              <IconBtn label="Empezar desde el principio" onClick={() => onPlay(resumeEp, 0)}>
                <RotateCcw className="size-5" />
              </IconBtn>
            )}
            <IconBtn
              label={inList ? "Quitar de Mi lista" : "Añadir a Mi lista"}
              on={inList}
              onClick={() => actions.toggleWatchlist(t.id)}
            >
              {inList ? <Check className="size-5" /> : <Plus className="size-5" />}
            </IconBtn>
            <IconBtn
              label="Me gusta"
              on={s.rating[t.id] === 1}
              onClick={() => actions.rate(t.id, 1)}
            >
              <ThumbsUp className="size-5" />
            </IconBtn>
            <IconBtn
              label="No me gusta"
              on={s.rating[t.id] === -1}
              onClick={() => actions.rate(t.id, -1)}
            >
              <ThumbsDown className="size-5" />
            </IconBtn>
            {!isMovie && (
              <IconBtn
                label="Episodio aleatorio"
                onClick={() => {
                  const e = t.episodes[Math.floor(Math.random() * t.episodes.length)]!;
                  onPlay(e, 0);
                }}
              >
                <Shuffle className="size-5" />
              </IconBtn>
            )}
            <IconBtn
              label={titleWatched ? "Marcar como no visto" : isMovie ? "Marcar como vista" : "Marcar todo como visto"}
              on={titleWatched}
              onClick={() => actions.setWatched(t.episodes.map((e) => e.id), !titleWatched)}
            >
              {titleWatched ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </IconBtn>
            {onFixMeta && (
              <IconBtn label="Corregir datos (título, carátula…)" onClick={() => setFixing(true)}>
                <PencilLine className="size-5" />
              </IconBtn>
            )}
            {t.episodes[0]?.path && window.nofufa && (
              <IconBtn
                label="Mostrar en carpeta"
                onClick={() => window.nofufa!.reveal(t.episodes[0]!.path!)}
              >
                <FolderOpen className="size-5" />
              </IconBtn>
            )}
          </div>
          {prog && isMovie && (
            <div className="w-80">
              <Progress value={prog.t / prog.d} className="rounded" />
              <p className="mt-1 text-xs text-muted-foreground">Quedan {fmt(prog.d - prog.t)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-24 sm:px-8 lg:px-12">
        {!isMovie && seasons.length > 1 && (
          <div className="relative mb-4 inline-block">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-3 rounded-lg bg-secondary px-5 py-3 text-lg font-bold hover:bg-accent"
            >
              Temporada {season} <ChevronDown className="size-4" />
            </button>
            {open && (
              <div className="absolute left-0 top-14 z-20 min-w-48 overflow-hidden rounded-lg bg-popover py-1 shadow-2xl">
                {seasons.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setSeason(n);
                      setOpen(false);
                    }}
                    className={`block w-full px-5 py-2 text-left hover:bg-accent ${n === season ? "font-bold text-primary-glow" : ""}`}
                  >
                    Temporada {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-8 border-b">
          {!isMovie && (
            <Tab on={tab === "episodes"} onClick={() => setTab("episodes")}>
              Episodios
            </Tab>
          )}
          <Tab on={tab === "details"} onClick={() => setTab("details")}>
            Detalles
          </Tab>
        </div>

        {tab === "episodes" && !isMovie && (
          <>
            <div className="flex items-center justify-between py-5">
              <p className="text-muted-foreground">{eps.length} episodios</p>
              <button
                onClick={() =>
                  actions.setWatched(
                    eps.map((e) => e.id),
                    !allWatched,
                  )
                }
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {allWatched ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{" "}
                {allWatched ? "Marcar temporada como no vista" : "Marcar temporada como vista"}
              </button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-x-5 gap-y-8">
              {eps.map((e) => (
                <EpisodeCard key={e.id} t={t} e={e} onPlay={onPlay} />
              ))}
            </div>
          </>
        )}
        {tab === "details" && (
          <dl className="grid max-w-3xl grid-cols-[10rem_1fr] gap-x-6 gap-y-4 py-8 text-sm">
            <dt className="text-muted-foreground">Título</dt>
            <dd className="font-semibold">{m?.title ?? t.name}</dd>
            <dt className="text-muted-foreground">Carpeta</dt>
            <dd className="font-semibold">{t.name}</dd>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="font-semibold">{KIND_LABEL[t.kind]}</dd>
            {m?.genres.length ? (
              <>
                <dt className="text-muted-foreground">Géneros</dt>
                <dd className="font-semibold">{m.genres.join(", ")}</dd>
              </>
            ) : null}
            {m?.year ? (
              <>
                <dt className="text-muted-foreground">Año</dt>
                <dd className="font-semibold">{m.year}</dd>
              </>
            ) : null}
            {m?.cast?.length ? (
              <>
                <dt className="text-muted-foreground">Reparto</dt>
                <dd className="font-semibold">{m.cast.join(", ")}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Archivos</dt>
            <dd className="font-semibold">{t.episodes.length}</dd>
            {m?.source && m.source !== "local" && (
              <>
                <dt className="text-muted-foreground">Información</dt>
                <dd className="text-muted-foreground">
                  {m.source === "anilist" ? "AniList" : "Cinemeta / IMDb"}
                  {hasOverride ? " · corregido a mano" : ""}
                </dd>
              </>
            )}
            {isMovie && t.episodes[0]?.path && (
              <>
                <dt className="text-muted-foreground">Ruta</dt>
                <dd className="break-all text-muted-foreground">{t.episodes[0].path}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}

function Tab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 pb-3 text-lg font-bold transition ${on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function EpisodeCard({
  t,
  e,
  onPlay,
}: {
  t: Title;
  e: Episode;
  onPlay: (e: Episode, at?: number) => void;
}) {
  const s = useStore();
  const em = episodeMeta(t, e);
  // si la carátula de internet no existe o no carga, se usa un fotograma del propio vídeo
  const [metaBad, setMetaBad] = useState(false);
  const metaThumb = metaBad ? undefined : em?.thumbnail;
  const img = useThumb(e, metaThumb);
  const p = s.progress[e.id];
  const watched = s.watched[e.id];
  return (
    <div className="group/ep">
      <button
        onClick={() => onPlay(e, p?.t)}
        className="relative block w-full overflow-hidden rounded-lg bg-card"
      >
        <div className="relative aspect-video">
          <Art
            src={img}
            alt={episodeTitle(t, e)}
            onError={metaThumb && img === metaThumb ? () => setMetaBad(true) : undefined}
            className="absolute inset-0 size-full transition duration-300 group-hover/ep:scale-105"
          />
          <div className="absolute inset-0 grid place-items-center bg-scrim/40 opacity-0 transition group-hover/ep:opacity-100">
            <span className="grid size-14 place-items-center rounded-full bg-foreground text-background">
              <Play className="size-7 fill-current" />
            </span>
          </div>
          {watched && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-background/85 px-2 py-0.5 text-xs font-bold">
              <Check className="size-3" /> Visto
            </span>
          )}
        </div>
        <Progress value={p ? p.t / p.d : watched ? 1 : 0} />
      </button>
      <div className="mt-3 flex items-start justify-between gap-2">
        <h3 className="font-bold uppercase leading-snug">
          {e.number}. {episodeTitle(t, e)}
        </h3>
        <button
          onClick={() => actions.setWatched([e.id], !watched)}
          title={watched ? "Marcar como no visto" : "Marcar como visto"}
          aria-label={watched ? "Marcar como no visto" : "Marcar como visto"}
          className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition hover:text-foreground group-hover/ep:opacity-100"
        >
          {watched ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {em?.overview && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{em.overview}</p>
      )}
      <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
        {p ? <span>Quedan {fmt(p.d - p.t)}</span> : null}
        {em?.released && (
          <span>
            {new Date(em.released).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
