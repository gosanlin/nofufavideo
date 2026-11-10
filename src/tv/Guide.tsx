import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clapperboard, Sparkles, Film, Layers, Radio } from "lucide-react";
import type { Title } from "./types";
import { PosterArt } from "./ui";
import { episodeTitle } from "./library";

const SLOT = 30; // minutos por bloque
const PX = 9; // px por minuto

function schedule(t: Title, start: Date) {
  const seed =
    t.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) +
    start.getHours() * 7 +
    start.getDate();
  return Array.from({ length: 6 }, (_, i) => ({
    ep: t.episodes[(seed + i * 3) % t.episodes.length]!,
    mins: ((seed + i) % 3 === 0 ? 2 : 1) * SLOT,
  }));
}

/** "TV en directo": cada título es un canal que emite episodios al azar. */
export function Guide({ titles, onTune }: { titles: Title[]; onTune: (t: Title) => void }) {
  const cats = [
    { id: "all", label: "Todos", icon: Layers },
    { id: "anime", label: "Anime", icon: Sparkles },
    { id: "series", label: "Series", icon: Clapperboard },
    { id: "movie", label: "Cine", icon: Film },
  ];
  const [cat, setCat] = useState("all");
  const [focus, setFocus] = useState(titles[0]?.id);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  const start = new Date(now);
  start.setMinutes(now.getMinutes() < 30 ? 0 : 30, 0, 0);
  const offset = (now.getTime() - start.getTime()) / 60000;
  const list = useMemo(() => titles.filter((t) => cat === "all" || t.kind === cat), [titles, cat]);
  const times = Array.from({ length: 6 }, (_, i) => new Date(start.getTime() + i * SLOT * 60000));
  const hm = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-full pt-20">
      <aside className="w-52 shrink-0 space-y-2 px-4 pt-6">
        <p className="mb-4 flex items-center gap-2 px-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Radio className="size-4 text-primary" /> TV en directo
        </p>
        {cats.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setCat(id)}
            className={`flex w-full items-center gap-3 rounded-full px-4 py-2.5 font-semibold transition ${cat === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-5" /> {label}
          </button>
        ))}
      </aside>

      <div className="relative flex-1 overflow-auto pr-6">
        <div className="sticky top-0 z-10 flex h-14 items-end bg-background pb-3 pl-[12.5rem]">
          {times.map((d) => (
            <span
              key={d.getTime()}
              className="shrink-0 text-sm font-semibold text-muted-foreground"
              style={{ width: SLOT * PX }}
            >
              {hm(d)}
            </span>
          ))}
        </div>
        <div
          className="pointer-events-none absolute bottom-0 top-10 z-20 w-0.5 bg-foreground"
          style={{ left: `calc(12.5rem + ${offset * PX}px)` }}
        >
          <span className="absolute -left-[5px] -top-1 size-3 rotate-45 bg-foreground" />
        </div>
        <div className="space-y-1.5 pb-10">
          {list.map((t, n) => {
            const sched = schedule(t, start);
            const open = focus === t.id;
            return (
              <div key={t.id} className="flex gap-1.5" onMouseEnter={() => setFocus(t.id)}>
                <button
                  onClick={() => onTune(t)}
                  className={`flex w-48 shrink-0 items-center gap-3 overflow-hidden rounded bg-card px-2 text-left ${open ? "h-28" : "h-14"}`}
                >
                  <span className="text-xs font-bold tabular-nums text-primary">
                    {String(n + 1).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-2 text-sm font-bold uppercase tracking-tight">
                    {t.meta?.title ?? t.name}
                  </span>
                </button>
                <div className="flex gap-1.5">
                  {sched.map(({ ep, mins }, i) =>
                    open && i === 0 ? (
                      <button
                        key={i}
                        onClick={() => onTune(t)}
                        className="flex h-28 shrink-0 overflow-hidden rounded border-2 border-primary bg-card text-left shadow-focus"
                        style={{ width: mins * PX * 2 - 6 }}
                      >
                        <div className="h-full w-20 shrink-0">
                          <PosterArt t={t} className="size-full" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
                          <p className="truncate text-lg font-bold">{episodeTitle(t, ep)}</p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            {hm(times[0]!)} – {hm(new Date(start.getTime() + mins * 60000))}
                          </p>
                          <p className="mt-1.5 line-clamp-2 text-sm">
                            {t.meta?.description ?? `${t.episodes.length} episodios`}
                          </p>
                        </div>
                        <ChevronRight className="m-3 size-6 self-center text-primary" />
                      </button>
                    ) : (
                      <div
                        key={i}
                        className={`flex shrink-0 items-center truncate rounded bg-card px-3 text-sm font-semibold ${open ? "h-28" : "h-14"} ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}
                        style={{ width: mins * PX - 6 }}
                      >
                        <span className="truncate">{episodeTitle(t, ep)}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
