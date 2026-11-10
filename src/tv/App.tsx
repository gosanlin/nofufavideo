import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, RefreshCw, Search, Settings, X, ArrowLeft, Trash2, FolderPlus, Home as HomeIcon, Film, Tv, Sparkles, Bookmark } from "lucide-react";
import type { Episode, Keys, Meta, Title } from "./types";
import { demoTitles, shuffleQueue, titlesFromRoots } from "./library";
import {
  EMPTY_FILTER,
  RES_LABEL,
  applyOverride,
  filterTitles,
  genresOf,
  loadOverrides,
  saveOverride,
  yearsOf,
  type LibFilter,
  type Overrides,
} from "./features";
import { useTvNavigation } from "./tvnav";
import { fetchMeta, clearMetaCache } from "./metadata";
import { actions, useStore } from "./store";
import { Home, Browse } from "./Home";
import { TitlePage } from "./TitlePage";
import { Player } from "./Player";
import logo from "./logo.png";
import { getApiKey, loadLulu, setApiKey } from "./lulu";

type Page = "home" | "movie" | "series" | "anime" | "video" | "list" | "search" | "title";
interface View {
  page: Page;
  id?: string;
}
interface Playing {
  epId: string;
  titleId: string;
  at: number;
  queue: string[] | null;
}

const NAV: [Page, string, typeof HomeIcon][] = [
  ["home", "Inicio", HomeIcon],
  ["movie", "Películas", Film],
  ["series", "Series", Tv],
  ["anime", "Anime", Sparkles],
  ["list", "Mi lista", Bookmark],
];

export function TvApp() {
  const s = useStore();
  const [titles, setTitles] = useState<Title[]>([]);
  const [view, setView] = useState<View>({ page: "home" });
  const [history, setHistory] = useState<View[]>([]);
  const [q, setQ] = useState("");
  const [play, setPlay] = useState<Playing | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const root = roots[0] ?? null;
  const [ov, setOv] = useState<Overrides>({});
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<LibFilter>(EMPTY_FILTER);
  const [playHidden, setPlayHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState("");
  const main = useRef<HTMLDivElement>(null);

  const enrich = useCallback((list: Title[]) => {
    const o = loadOverrides();
    list.forEach((t) => {
      if (o[t.id]) return; // corregido a mano: no se vuelve a buscar
      if (t.meta?.source === "local" && t.meta.description && t.images?.poster) return;
      fetchMeta(t.name, t.kind)
        .then((meta) => {
          if (!meta) return;
          setTitles((cs) =>
            cs.map((x) =>
              x.id === t.id
                ? {
                    ...x,
                    meta: { ...meta, ...(x.meta?.source === "local" ? x.meta : {}) },
                    kind: x.kind === "series" && meta.kind === "anime" ? "anime" : x.kind,
                  }
                : x,
            ),
          );
        })
        .catch(() => {});
    });
  }, []);

  const load = useCallback(
    (list: Title[]) => {
      setTitles(list);
      enrich(list);
    },
    [enrich],
  );
  /** Resolución de cada título (primer archivo), en segundo plano, para el filtro 4K/1080p. */
  const probeHeights = useCallback(async (list: Title[]) => {
    const b = window.nofufa;
    if (!b) return;
    const todo = list.filter((t) => t.episodes[0]?.path);
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const t = todo[i++]!;
        const p = await b.probe(t.episodes[0]!.path!).catch(() => null);
        if (p?.height) setHeights((h) => ({ ...h, [t.id]: p.height }));
      }
    };
    await Promise.all([worker(), worker()]);
  }, []);
  const rescan = useCallback(
    async (rs: string[]) => {
      setLoading(true);
      try {
        const list = rs.length ? await titlesFromRoots(rs) : [];
        load(list);
        probeHeights(list);
      } finally {
        setLoading(false);
      }
    },
    [load, probeHeights],
  );

  useEffect(() => {
    setOv(loadOverrides());
    const b = window.nofufa;
    if (b)
      (b.getRoots ? b.getRoots() : b.getRoot().then((r) => (r ? [r] : []))).then((rs) => {
        if (rs.length) {
          setRoots(rs);
          rescan(rs);
        } else enrich(titles);
      });
    else loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Catálogo online de Luluvido (GitHub Pages). Si está vacío se muestra contenido de muestra. */
  const loadCatalog = async (fresh = false) => {
    setLoading(true);
    try {
      if (fresh) clearMetaCache();
      const list = await loadLulu(fresh);
      load(list.length ? list : demoTitles());
      if (fresh) setCatalogMsg(list.length ? `Catálogo actualizado: ${list.length} títulos.` : "No se encontraron vídeos.");
    } catch {
      load(demoTitles());
    } finally {
      setLoading(false);
    }
  };
  const pickFolder = async () => {
    const b = window.nofufa;
    if (b) {
      const rs = b.addRoot ? await b.addRoot() : await b.pickFolder().then((r) => (r ? [r] : null));
      if (rs) {
        setRoots(rs);
        rescan(rs);
        go({ page: "home" });
      }
    } else loadCatalog(true);
  };
  const removeRoot = async (r: string) => {
    const b = window.nofufa;
    if (!b?.removeRoot) return;
    const rs = await b.removeRoot(r);
    setRoots(rs);
    rescan(rs);
  };
  const fixMeta = (id: string, m: Meta | null) => {
    saveOverride(id, m);
    setOv(loadOverrides());
    if (!m) {
      const t = titles.find((x) => x.id === id);
      if (t) {
        setTitles((cs) => cs.map((x) => (x.id === id ? { ...x, meta: undefined } : x)));
        enrich([t]);
      }
    }
  };

  const go = (v: View) => {
    setHistory((h) => [...h, view].slice(-30));
    setView(v);
    main.current?.scrollTo(0, 0);
  };
  const back = () => {
    setHistory((h) => {
      const p = h[h.length - 1];
      if (p) setView(p);
      return h.slice(0, -1);
    });
  };
  const open = (t: Title) => go({ page: "title", id: t.id });

  // la corrección manual ("Corregir datos") manda sobre los datos automáticos
  const shown = useMemo(() => titles.map((t) => applyOverride(t, ov)), [titles, ov]);
  const byId = useMemo(() => new Map(shown.map((t) => [t.id, t])), [shown]);
  const allEps = useMemo(() => titles.flatMap((t) => t.episodes), [titles]);
  const epById = useMemo(() => new Map(allEps.map((e) => [e.id, e])), [allEps]);

  const startEp = (ep: Episode, at = 0) => {
    setPlayHidden(false);
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    startPlay(ep, at);
  };
  const startPlay = (ep: Episode, at: number) =>
    setPlay({ epId: ep.id, titleId: ep.titleId, at, queue: null });
  const cur = play ? epById.get(play.epId) : undefined;
  const curTitle = cur ? byId.get(cur.titleId) : undefined;
  const nextEp = useMemo(() => {
    if (!play || !cur || !curTitle) return undefined;
    if (play.queue) return epById.get(play.queue[0] ?? "") ?? undefined;
    const i = curTitle.episodes.findIndex((e) => e.id === cur.id);
    return curTitle.episodes[i + 1];
  }, [play, cur, curTitle, epById]);

  const goNext = () =>
    setPlay((p) => {
      if (!p) return p;
      if (p.queue) {
        let qu = p.queue;
        if (!qu.length) qu = shuffleQueue(poolFor(), Math.random, p.epId);
        const id = qu[0];
        if (!id) return null;
        return { epId: id, titleId: epById.get(id)!.titleId, at: 0, queue: qu.slice(1) };
      }
      return nextEp
        ? {
            epId: nextEp.id,
            titleId: nextEp.titleId,
            at: s.progress[nextEp.id]?.t ?? 0,
            queue: null,
          }
        : null;
    });
  const poolFor = () => allEps.map((e) => e.id);
  const randomNow = () => {
    if (!cur) return;
    const pool = play?.queue
      ? allEps
      : (curTitle?.episodes ?? allEps);
    const others = pool.filter((e) => e.id !== cur.id);
    const e = others[Math.floor(Math.random() * others.length)];
    if (e) setPlay((p) => p && { ...p, epId: e.id, titleId: e.titleId, at: 0 });
  };

  const filtered = (k: Page) => {
    if (k === "list") return s.watchlist.map((id) => byId.get(id)).filter(Boolean) as Title[];
    if (k === "search") {
      const n = q.trim().toLowerCase();
      return n
        ? shown.filter((t) =>
            [
              t.name,
              t.meta?.title,
              ...(t.meta?.genres ?? []),
              ...t.episodes.map((e) => e.name),
            ].some((x) => x?.toLowerCase().includes(n)),
          )
        : [];
    }
    return shown.filter((t) => t.kind === k);
  };
  useEffect(() => setFilter(EMPTY_FILTER), [view.page]);
  useTvNavigation({
    enabled: s.settings.tvMode,
    playerOpen: !!play && !playHidden,
    onBack: () => {
      if (settingsOpen) setSettingsOpen(false);
      else back();
    },
  });
  const HEAD: Record<string, string> = {
    movie: "Películas",
    series: "Series",
    anime: "Anime",
    list: "Mi lista",
    search: q ? `Resultados para “${q}”` : "Buscar",
  };
  const titleView = view.page === "title" ? byId.get(view.id!) : undefined;

  return (
    <div className="h-screen bg-background text-foreground">
      <header
        className={`fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 px-4 transition-colors sm:h-16 sm:gap-6 sm:px-8 lg:px-12 ${scrolled || view.page !== "home" ? "bg-nav" : "bg-nav-fade"}`}
      >
        {history.length > 0 && view.page === "title" && (
          <button onClick={back} aria-label="Atrás" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <button
          onClick={() => go({ page: "home" })}
          className={`flex shrink-0 items-center gap-2 ${searchOpen ? "hidden sm:flex" : ""}`}
        >
          <img src={logo} alt="" className="size-7 rounded-full sm:size-8" />
          <span className="text-base font-extrabold tracking-tight sm:text-lg">
            Nofufa<span className="text-primary"> Video</span>
          </span>
        </button>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map(([p, l]) => (
            <button
              key={p}
              onClick={() => go({ page: p })}
              className={`nav-link ${view.page === p ? "nav-link-active" : ""}`}
            >
              {l}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <label
            className={`h-9 min-w-0 items-center gap-2 rounded-md bg-foreground/10 px-3 focus-within:ring-2 focus-within:ring-primary ${searchOpen ? "flex" : "hidden sm:flex"}`}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              autoFocus={searchOpen}
              onChange={(e) => {
                setQ(e.target.value);
                if (view.page !== "search") go({ page: "search" });
              }}
              placeholder="Buscar"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-44"
            />
            {(q || searchOpen) && (
              <button
                onClick={() => {
                  setQ("");
                  setSearchOpen(false);
                }}
                aria-label="Borrar búsqueda"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          {!searchOpen && (
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar"
              className="grid size-9 place-items-center rounded-full hover:bg-foreground/10 sm:hidden"
            >
              <Search className="size-5" />
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Ajustes"
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-foreground/10"
          >
            <Settings className="size-5" />
          </button>
        </div>
      </header>

      <nav className="bg-nav fixed inset-x-0 bottom-0 z-40 flex justify-around pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(([p, l, Icon]) => (
          <button
            key={p}
            onClick={() => go({ page: p })}
            className={`tab-link ${view.page === p ? "tab-link-active" : ""}`}
          >
            <Icon className="size-5" />
            {l}
          </button>
        ))}
      </nav>

      <div
        ref={main}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 40)}
        className="h-full overflow-y-auto overflow-x-hidden"
      >
        {view.page === "home" && (
          <Home
            titles={shown}
            onOpen={open}
            onPlay={(_t, ep, at) => startEp(ep, at)}
          />
        )}
        {view.page === "title" && titleView && (
          <TitlePage
            key={titleView.id}
            t={titleView}
            onPlay={startEp}
            hasOverride={!!ov[titleView.id]}
            onFixMeta={(m) => fixMeta(titleView.id, m)}
          />
        )}
        {view.page === "title" && !titleView && (
          <Browse
            titles={[]}
            heading="No encontrado"
            onOpen={open}
            empty="Este título ya no está en tu biblioteca."
          />
        )}
        {["movie", "series", "anime", "list", "search"].includes(view.page) && (
          <Browse
            titles={filterTitles(filtered(view.page), filter, heights)}
            toolbar={
              <FilterBar
                f={filter}
                set={setFilter}
                titles={filtered(view.page)}
                hasRes={Object.keys(heights).length > 0}
              />
            }
            heading={HEAD[view.page]!}
            onOpen={open}
            empty={
              view.page === "list"
                ? "Añade títulos con el botón + para verlos aquí."
                : view.page === "search"
                  ? "Escribe para buscar en tu biblioteca."
                  : "No hay nada aquí todavía."
            }
          />
        )}
      </div>


      {settingsOpen && (
        <div
          className="tv-modal fixed inset-0 z-50 grid place-items-center bg-scrim/70 p-3 sm:p-6"
          onClick={() => setSettingsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSettingsOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-popover p-5 sm:p-6 text-popover-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Ajustes</h2>
              <button onClick={() => setSettingsOpen(false)} aria-label="Cerrar">
                <X className="size-5" />
              </button>
            </div>
            {window.nofufa && (
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Biblioteca
              </p>
            )}
            {window.nofufa && roots.length === 0 && (
              <p className="mt-1 truncate text-sm">Sin carpeta elegida</p>
            )}
            <ul className="mt-1 space-y-1">
              {roots.map((r) => (
                <li key={r} className="flex items-center gap-2 rounded bg-secondary/60 px-3 py-1.5 text-sm">
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate" title={r}>
                    {r}
                  </span>
                  <button
                    onClick={() => removeRoot(r)}
                    aria-label={`Quitar ${r}`}
                    title="Quitar carpeta"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={pickFolder}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {window.nofufa ? (
                  <FolderPlus className="size-4" />
                ) : (
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                )}{" "}
                {window.nofufa ? "Añadir carpeta" : loading ? "Sincronizando…" : "Recargar catálogo"}
              </button>
              {root && (
                <button
                  onClick={() => rescan(roots)}
                  className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-semibold"
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Volver a
                  escanear
                </button>
              )}
            </div>
            {catalogMsg && !window.nofufa && <p className="mt-2 text-sm text-primary">{catalogMsg}</p>}
            {!window.nofufa && <ApiKeyField onSaved={() => loadCatalog(true)} />}
            <p className={`mt-2 text-xs text-muted-foreground ${window.nofufa ? "" : "hidden"}`}>
              Organiza por carpetas: cada subcarpeta es una serie o película. Usa carpetas llamadas
              "Películas", "Series" o "Anime" para clasificarlas. Opcional: poster.jpg y fanart.jpg
              dentro de cada carpeta.
            </p>

            <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Reproducción
            </p>
            <div className="mt-2 space-y-2 text-sm">
              <Toggle
                label="Siguiente episodio automático"
                on={s.settings.autoplayNext}
                set={(v) => actions.setSettings({ autoplayNext: v })}
              />
              <Toggle
                label="Mostrar botón “Saltar intro”"
                on={s.settings.skipIntro}
                set={(v) => actions.setSettings({ skipIntro: v })}
              />
              <Toggle
                label="Modo TV (flechas / mando, sin ratón)"
                on={s.settings.tvMode}
                set={(v) => actions.setSettings({ tvMode: v })}
              />
              <Toggle
                label="Modo nocturno (voces claras)"
                on={s.settings.nightMode}
                set={(v) => actions.setSettings({ nightMode: v })}
              />
            </div>
            {window.nofufa?.getKeys && <Accounts />}
            <div className="mt-6 border-t pt-4">
              <button
                onClick={() => {
                  if (confirm("¿Borrar todo el historial de reproducción?")) actions.clearHistory();
                }}
                className="text-sm font-semibold text-destructive hover:underline"
              >
                Borrar historial de reproducción
              </button>
            </div>
          </div>
        </div>
      )}

      {play && cur && curTitle && (
        <Player
          key={cur.id}
          title={curTitle}
          episode={cur}
          startAt={play.at}
          broadcast={!!play.queue}
          next={nextEp ?? (play.queue ? cur : undefined)}
          onClose={() => {
            setPlay(null);
            setPlayHidden(false);
          }}
          onNext={goNext}
          onRandom={randomNow}
          hidden={playHidden}
          onMinimize={() => setPlayHidden(true)}
          onRestore={() => setPlayHidden(false)}
        />
      )}
    </div>
  );
}

function ApiKeyField({ onSaved }: { onSaved: () => void }) {
  const [k, setK] = useState(() => getApiKey());
  return (
    <div className="mt-4">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="lulukey">
        Clave API de LuluStream
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="lulukey"
          type="password"
          value={k}
          onChange={(e) => setK(e.target.value)}
          placeholder="Pega tu clave para ver los vídeos nuevos al momento"
          className="min-w-0 flex-1 rounded bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={() => {
            setApiKey(k);
            onSaved();
          }}
          className="rounded-md bg-secondary px-3 text-sm font-semibold hover:bg-accent"
        >
          Guardar
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Se guarda solo en este navegador. Sin clave, los vídeos nuevos aparecen cuando GitHub actualiza el catálogo (cada 15 min).
      </p>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex w-full items-center justify-between">
      {label}
      <span
        className={`relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-secondary"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-foreground transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function FilterBar({
  f,
  set,
  titles,
  hasRes,
}: {
  f: LibFilter;
  set: (f: LibFilter) => void;
  titles: Title[];
  hasRes: boolean;
}) {
  const genres = genresOf(titles);
  const years = yearsOf(titles);
  const sel = "rounded-md bg-secondary px-3 py-1.5 text-sm font-semibold";
  const active = f.genre || f.year || f.res;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 [&>select]:max-w-full">
      <select aria-label="Género" value={f.genre} onChange={(e) => set({ ...f, genre: e.target.value })} className={sel}>
        <option value="">Todos los géneros</option>
        {genres.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <select aria-label="Año" value={f.year} onChange={(e) => set({ ...f, year: e.target.value })} className={sel}>
        <option value="">Cualquier año</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        aria-label="Resolución"
        value={f.res}
        onChange={(e) => set({ ...f, res: e.target.value as LibFilter["res"] })}
        className={sel}
        title={hasRes ? undefined : "Se calcula al analizar la biblioteca"}
      >
        <option value="">Cualquier calidad</option>
        {(Object.keys(RES_LABEL) as (keyof typeof RES_LABEL)[]).map((r) => (
          <option key={r} value={r}>
            {RES_LABEL[r]}
          </option>
        ))}
      </select>
      <select
        aria-label="Ordenar"
        value={f.sort}
        onChange={(e) => set({ ...f, sort: e.target.value as LibFilter["sort"] })}
        className={sel}
      >
        <option value="name">Orden: nombre</option>
        <option value="year">Orden: año</option>
        <option value="added">Orden: añadidos recientemente</option>
      </select>
      {active && (
        <button
          onClick={() => set({ ...EMPTY_FILTER, sort: f.sort })}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}

function Accounts() {
  const b = window.nofufa!;
  const [k, setK] = useState<Keys | null>(null);
  const [code, setCode] = useState<{ user_code: string; verification_url: string } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    b.getKeys!().then(setK);
  }, [b]);
  // mientras se espera el código de Trakt, comprobar si ya se conectó
  useEffect(() => {
    if (!code) return;
    const i = setInterval(() => {
      b.getKeys!().then((x) => {
        setK(x);
        if (x.traktUser) setCode(null);
      });
    }, 3000);
    return () => clearInterval(i);
  }, [code, b]);
  if (!k) return null;
  const save = (p: Partial<Keys>) => b.setKeys!(p).then(setK);
  const field = (name: keyof Keys, label: string, secret = false) => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type={secret ? "password" : "text"}
        defaultValue={String(k[name] ?? "")}
        onBlur={(e) => {
          if (e.target.value !== k[name]) save({ [name]: e.target.value });
        }}
        className="mt-0.5 w-full rounded bg-secondary px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
  return (
    <>
      <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Subtítulos de internet
      </p>
      <div className="mt-2 space-y-2">
        {field("osKey", "Clave API de OpenSubtitles (opensubtitles.com → Consumers)", true)}
        {field("subdlKey", "Clave API de SubDL (subdl.com → Panel → API)", true)}
      </div>

      <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Trakt.tv y AniList
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Al terminar una película o episodio (90 %) se marca como visto en tu perfil. Crea una app
        gratis en trakt.tv/oauth/applications (Redirect URI: urn:ietf:wg:oauth:2.0:oob) y en
        anilist.co/settings/developer (Redirect URL: https://anilist.co/api/v2/oauth/pin).
      </p>
      <div className="mt-2 space-y-2">
        {field("traktId", "Trakt · Client ID")}
        {field("traktSecret", "Trakt · Client Secret", true)}
        <div className="flex items-center gap-2 text-sm">
          {k.traktUser ? (
            <>
              <span className="font-semibold text-primary-glow">Trakt conectado</span>
              <button onClick={() => b.logout!("trakt").then(setK)} className="text-muted-foreground hover:underline">
                Desconectar
              </button>
            </>
          ) : (
            <button
              disabled={!k.traktId || !k.traktSecret}
              onClick={async () => {
                setMsg("");
                const r = await b.traktStart!();
                if ("error" in r) setMsg(r.error);
                else setCode(r);
              }}
              className="rounded bg-secondary px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              Conectar Trakt
            </button>
          )}
        </div>
        {code && (
          <p className="rounded bg-secondary/60 p-2 text-sm">
            Abre <b>{code.verification_url}</b> e introduce el código{" "}
            <b className="text-lg tracking-widest">{code.user_code}</b>
          </p>
        )}
        {field("anilistId", "AniList · Client ID")}
        <div className="flex items-center gap-2 text-sm">
          {k.anilistUser ? (
            <>
              <span className="font-semibold text-primary-glow">AniList conectado</span>
              <button onClick={() => b.logout!("anilist").then(setK)} className="text-muted-foreground hover:underline">
                Desconectar
              </button>
            </>
          ) : (
            <button
              disabled={!k.anilistId}
              onClick={async () => {
                setMsg("");
                const ok = await b.anilistLogin!();
                setK(await b.getKeys!());
                if (!ok) setMsg("No se completó la conexión con AniList.");
              }}
              className="rounded bg-secondary px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              Conectar AniList
            </button>
          )}
        </div>
        {msg && <p className="text-xs text-destructive">{msg}</p>}
      </div>
    </>
  );
}
