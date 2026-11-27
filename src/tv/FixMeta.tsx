import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Search, X } from "lucide-react";
import type { Kind, Meta, MetaCandidate, Title } from "./types";
import { loadCandidate, searchMetaCandidates } from "./metadata";
import { parseQuery } from "./match";
import { KIND_LABEL } from "./ui";

const PROV: Record<MetaCandidate["provider"], string> = {
  cinemeta: "IMDb",
  anilist: "AniList",
  tvmaze: "TVmaze",
  kitsu: "Kitsu",
};

/** Ventana "Corregir datos": elegir otro resultado o buscar con el título exacto. */
export function FixMeta({
  t,
  hasOverride,
  onPick,
  onReset,
  onClose,
}: {
  t: Title;
  hasOverride: boolean;
  onPick: (m: Meta) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const guess = parseQuery(t.name);
  const [q, setQ] = useState(guess.text);
  const [year, setYear] = useState(guess.year ? String(guess.year) : "");
  const [kind, setKind] = useState<Kind | "">("");
  const [list, setList] = useState<MetaCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState("");
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      setList(await searchMetaCandidates(q, kind, year ? +year : undefined));
    } catch {
      setErr("No se pudo buscar. Revisa la conexión a internet.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/70 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-popover p-6 text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xl font-bold">Corregir datos</h2>
          <button onClick={onClose} aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Carpeta: <span className="text-foreground">{t.name}</span> · elige el resultado correcto o
          escribe el título exacto.
        </p>
        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Título exacto"
            className="min-w-60 flex-1 rounded-md bg-secondary px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="Año"
            className="w-20 rounded-md bg-secondary px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind | "")}
            className="rounded-md bg-secondary px-2 py-2"
          >
            <option value="">Todo</option>
            <option value="movie">Película</option>
            <option value="series">Serie</option>
            <option value="anime">Anime</option>
          </select>
          <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">
            <Search className="size-4" /> Buscar
          </button>
        </form>
        {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
        <div className="-mx-2 flex-1 overflow-auto px-2">
          {busy && <Loader2 className="mx-auto my-10 size-8 animate-spin" />}
          {!busy && list?.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">Sin resultados. Prueba otro título.</p>
          )}
          {!busy && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
              {list?.map((c) => (
                <button
                  key={c.key}
                  disabled={!!picking}
                  onClick={async () => {
                    setPicking(c.key);
                    setErr("");
                    try {
                      const m = await loadCandidate(c);
                      if (m) onPick(m);
                      else setErr("No se pudieron cargar los datos de ese resultado.");
                    } catch {
                      setErr("No se pudieron cargar los datos de ese resultado.");
                    } finally {
                      setPicking("");
                    }
                  }}
                  className="group text-left disabled:opacity-60"
                  title={c.description}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-card ring-primary transition group-hover:ring-2 group-focus:ring-2">
                    {c.poster ? (
                      <img src={c.poster} alt={c.title} className="size-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid size-full place-items-center p-2 text-center text-xs text-muted-foreground">
                        Sin carátula
                      </div>
                    )}
                    {picking === c.key && (
                      <div className="absolute inset-0 grid place-items-center bg-scrim/60">
                        <Loader2 className="size-6 animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-tight">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.year, KIND_LABEL[c.kind], PROV[c.provider]].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        {hasOverride && (
          <div className="mt-4 border-t pt-3">
            <button
              onClick={onReset}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-4" /> Restaurar automático
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
