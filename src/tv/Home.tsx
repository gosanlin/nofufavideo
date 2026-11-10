import { useEffect, useMemo, useState } from "react";
import { Info, Play, Plus, Check } from "lucide-react";
import type { Episode, Kind, Title } from "./types";
import { actions, useStore } from "./store";
import { Art, Card, KIND_LABEL, PosterCard, Row, backdrop } from "./ui";

interface Props {
  titles: Title[];
  onOpen: (t: Title) => void;
  onPlay: (t: Title, ep: Episode, at?: number) => void;
}

export function Home({ titles, onOpen, onPlay }: Props) {
  const s = useStore();
  const byId = useMemo(() => new Map(titles.map((t) => [t.id, t])), [titles]);

  const cont = useMemo(() => {
    const latest = new Map<string, { ep: Episode; t: number; d: number; at: number }>();
    for (const [epId, p] of Object.entries(s.progress)) {
      const t = byId.get(p.titleId);
      if (!t) continue;
      const hidden = s.hiddenContinue[t.id];
      if (hidden && hidden > p.at) continue;
      const ep = t.episodes.find((e) => e.id === epId);
      if (!ep) continue;
      const cur = latest.get(t.id);
      if (!cur || cur.at < p.at) latest.set(t.id, { ep, ...p });
    }
    return [...latest.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id, v]) => ({ title: byId.get(id)!, ...v }));
  }, [s.progress, s.hiddenContinue, byId]);

  const featured = useMemo(() => {
    const withArt = titles.filter((t) => backdrop(t));
    return (withArt.length ? withArt : titles).slice(0, 6);
  }, [titles]);
  const [hi, setHi] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setHi((h) => (h + 1) % Math.max(1, featured.length)), 9000);
    return () => clearInterval(i);
  }, [featured.length]);
  const hero = featured[hi % Math.max(1, featured.length)];

  const list = s.watchlist.map((id) => byId.get(id)).filter(Boolean) as Title[];
  const recent = [...titles].sort((a, b) => b.added - a.added).slice(0, 20);
  const liked = titles.filter((t) => s.rating[t.id] === 1);
  const kinds: [Kind, string][] = [
    ["series", "Series"],
    ["anime", "Anime"],
    ["movie", "Películas"],
  ];

  return (
    <div className="pb-16">
      {hero && (
        <div className="relative h-[62vh] min-h-[26rem] sm:h-[80vh]">
          <div className="absolute inset-0 overflow-hidden">
            {featured.map((t, i) => (
              <div
                key={t.id}
                className={`absolute inset-0 transition-opacity duration-1000 ${i === hi ? "opacity-100" : "opacity-0"}`}
              >
                <Art src={backdrop(t)} alt={t.name} className="size-full object-top" bare />
              </div>
            ))}
            <div className="bg-hero-fade absolute inset-0" />
          </div>
          <div className="relative flex h-full max-w-2xl flex-col justify-end gap-4 px-4 pb-20 sm:px-8 sm:pb-24 lg:px-12">
            <span className="w-fit rounded bg-foreground/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
              {KIND_LABEL[hero.kind]}
            </span>
            {hero.meta?.logo ? (
              <img
                src={hero.meta.logo}
                alt={hero.meta.title}
                className="max-h-16 max-w-[70%] sm:max-h-28 sm:max-w-md object-contain object-left"
              />
            ) : (
              <h1 className="text-3xl font-extrabold sm:text-5xl lg:text-6xl leading-none tracking-tight">
                {hero.meta?.title ?? hero.name}
              </h1>
            )}
            {hero.meta?.description && (
              <p className="line-clamp-2 text-sm sm:line-clamp-3 sm:text-lg">{hero.meta.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlay(hero, hero.episodes[0]!)}
                className="flex h-11 items-center gap-2 rounded-md bg-primary px-5 font-bold text-primary-foreground hover:bg-primary-glow sm:h-12 sm:px-7"
              >
                <Play className="size-5 fill-current" /> Reproducir
              </button>
              <button
                onClick={() => onOpen(hero)}
                className="flex h-11 items-center gap-2 rounded-md bg-secondary/80 px-4 sm:h-12 sm:px-6 font-bold backdrop-blur hover:bg-accent"
              >
                <Info className="size-5" /> Más información
              </button>
              <button
                onClick={() => actions.toggleWatchlist(hero.id)}
                aria-label="Mi lista"
                className="grid size-11 sm:size-12 place-items-center rounded-full border-2 border-foreground/40 hover:border-foreground"
              >
                {s.watchlist.includes(hero.id) ? (
                  <Check className="size-5" />
                ) : (
                  <Plus className="size-5" />
                )}
              </button>
            </div>
          </div>
          <div className="absolute bottom-6 right-4 sm:bottom-10 sm:right-12 flex gap-2">
            {featured.map((t, i) => (
              <button
                key={t.id}
                aria-label={`Destacado ${i + 1}`}
                onClick={() => setHi(i)}
                className={`h-1.5 rounded-full transition-all ${i === hi ? "w-8 bg-foreground" : "w-3 bg-foreground/40"}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="relative -mt-10 space-y-2 sm:-mt-14 sm:space-y-4">

        {cont.length > 0 && (
          <Row title="Seguir viendo">
            {cont.map(({ title: t, ep, t: at, d }) => (
              <Card
                key={t.id}
                t={t}
                thumbEp={ep}
                onOpen={() => onOpen(t)}
                onPlay={() => onPlay(t, ep, at)}
                progress={at / d}
                sub={
                  t.kind === "movie" || t.episodes.length === 1
                    ? (t.meta?.title ?? t.name)
                    : `${t.meta?.title ?? t.name} · T${ep.season} E${ep.number}`
                }
                onRemove={() => actions.removeContinue(t.id)}
              />
            ))}
          </Row>
        )}
        {list.length > 0 && (
          <Row title="Mi lista">
            {list.map((t) => (
              <PosterCard key={t.id} t={t} onOpen={() => onOpen(t)} />
            ))}
          </Row>
        )}
        <Row title="Añadidos recientemente">
          {recent.map((t) => (
            <Card
              key={t.id}
              t={t}
              thumbEp={t.episodes[0]}
              onOpen={() => onOpen(t)}
              sub={t.meta?.title ?? t.name}
            />
          ))}
        </Row>
        {kinds.map(([k, label]) => {
          const items = titles.filter((t) => t.kind === k);
          return items.length ? (
            <Row key={k} title={label}>
              {items.map((t) => (
                <PosterCard key={t.id} t={t} onOpen={() => onOpen(t)} />
              ))}
            </Row>
          ) : null;
        })}
        {liked.length > 0 && (
          <Row title="Te gustan">
            {liked.map((t) => (
              <PosterCard key={t.id} t={t} onOpen={() => onOpen(t)} />
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}

export function Browse({
  titles,
  heading,
  onOpen,
  empty,
  toolbar,
}: {
  titles: Title[];
  heading: string;
  onOpen: (t: Title) => void;
  empty: string;
  toolbar?: React.ReactNode;
}) {
  return (
    <div className="px-4 pb-24 pt-20 sm:px-8 sm:pt-28 lg:px-12">
      <h1 className="mb-6 text-2xl font-extrabold sm:text-3xl">{heading}</h1>
      {toolbar}
      {titles.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-x-4 gap-y-6">
          {titles.map((t) => (
            <PosterCard key={t.id} t={t} onOpen={() => onOpen(t)} />
          ))}
        </div>
      )}
    </div>
  );
}
