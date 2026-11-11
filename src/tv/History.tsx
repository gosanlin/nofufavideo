import { useMemo, useState } from "react";
import { Pause, Play, Search, Trash2, X } from "lucide-react";
import type { Episode, Title } from "./types";
import { actions, useStore, type HistoryEntry } from "./store";
import { Art, Progress, backdrop } from "./ui";

/** Agrupa por día: "Hoy", "Ayer" o la fecha. */
export function dayLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date(now)) - start(d)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function HistoryPage({
  titles,
  onOpen,
  onPlay,
}: {
  titles: Title[];
  onOpen: (t: Title) => void;
  onPlay: (ep: Episode, at?: number) => void;
}) {
  const s = useStore();
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(titles.map((t) => [t.id, t])), [titles]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out: { h: HistoryEntry; t: Title; ep: Episode }[] = [];
    for (const h of s.history ?? []) {
      const t = byId.get(h.titleId);
      const ep = t?.episodes.find((e) => e.id === h.epId);
      if (!t || !ep) continue;
      if (n && ![t.name, t.meta?.title, ep.name].some((x) => x?.toLowerCase().includes(n))) continue;
      out.push({ h, t, ep });
    }
    return out;
  }, [s.history, byId, q]);
  const groups = useMemo(() => {
    const g = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = dayLabel(r.h.at);
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g.entries()];
  }, [rows]);
  const total = rows.reduce((a, r) => a + Math.min(r.h.t, r.h.d || r.h.t), 0);

  return (
    <div className="px-4 pb-24 pt-20 sm:px-8 sm:pt-28 md:pb-16 lg:px-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Historial</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} episodios · {fmt(total)} vistos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 items-center gap-2 rounded-md bg-foreground/10 px-3 focus-within:ring-2 focus-within:ring-primary">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en el historial"
              className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            onClick={() => actions.setSettings({ pauseHistory: !s.settings.pauseHistory })}
            className="flex h-9 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-semibold hover:bg-accent"
          >
            {s.settings.pauseHistory ? <Play className="size-4" /> : <Pause className="size-4" />}
            {s.settings.pauseHistory ? "Reanudar historial" : "Pausar historial"}
          </button>
          <button
            onClick={() => {
              if (confirm("¿Borrar todo el historial de visto?")) actions.clearHistory();
            }}
            disabled={!s.history?.length}
            className="flex h-9 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-semibold text-destructive hover:bg-accent disabled:opacity-40"
          >
            <Trash2 className="size-4" /> Borrar todo
          </button>
        </div>
      </div>
      {s.settings.pauseHistory && (
        <p className="mb-4 rounded-md bg-secondary px-4 py-3 text-sm">
          El historial está en pausa: lo que veas ahora no se guardará.
        </p>
      )}
      {groups.length === 0 ? (
        <p className="text-muted-foreground">
          {q ? "Nada coincide con tu búsqueda." : "Aún no has visto nada. Lo que veas aparecerá aquí."}
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground first-letter:uppercase">
                {day}
              </h2>
              <ul className="space-y-2">
                {items.map(({ h, t, ep }) => {
                  const done = !!s.watched[ep.id];
                  const series = t.episodes.length > 1;
                  return (
                    <li key={h.epId} className="group flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/60">
                      <button
                        onClick={() => onPlay(ep, done ? 0 : h.t)}
                        className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md sm:w-40"
                        aria-label={`Reproducir ${t.meta?.title ?? t.name}`}
                      >
                        <Art src={backdrop(t)} alt={t.name} className="size-full" />
                        <span className="absolute inset-0 grid place-items-center bg-scrim/40 opacity-0 transition group-hover:opacity-100">
                          <Play className="size-7 fill-current" />
                        </span>
                        <Progress value={done ? 1 : h.d ? h.t / h.d : 0} className="absolute inset-x-0 bottom-0" />
                      </button>
                      <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                        <p className="truncate font-semibold">{t.meta?.title ?? t.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {series ? `T${ep.season} E${ep.number} · ${ep.name}` : ep.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {done ? "Visto" : h.d ? `${Math.round((h.t / h.d) * 100)}% · quedan ${fmt(h.d - h.t)}` : ""}
                        </p>
                      </button>
                      <button
                        onClick={() => actions.removeHistory([h.epId])}
                        aria-label="Quitar del historial"
                        className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
