import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  SkipForward,
  Volume2,
  VolumeX,
  Gauge,
  PictureInPicture2,
  Download,
  Moon,
  Search,
} from "lucide-react";
import type { Episode, Probe, Sprite, SubResult, SubSource, Title } from "./types";
import { clampSync, shouldScrobble } from "./features";
import { watermarkRect } from "./watermark";
import watermark from "./watermark.png";
import { parseVtt, activeCues, type Cue } from "./vtt";
import { langName, matchLang } from "./langs";
import { actions, langPrefs, useStore } from "./store";
import { useStereoFix } from "./stereo";
import { episodeTitle } from "./library";
import { isEmbed } from "./lulu";
import { EmbedPlayer } from "./EmbedPlayer";

export function fmt(t: number) {
  if (!isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function Skip({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir < 0 ? "Retroceder 10 segundos" : "Avanzar 10 segundos"}
      className="relative grid size-20 place-items-center text-overlay-foreground/90 transition hover:scale-105 hover:text-overlay-foreground"
    >
      <svg
        viewBox="0 0 80 80"
        className="absolute inset-0"
        style={{ transform: dir < 0 ? "scaleX(-1)" : undefined }}
      >
        <path d="M40 8 A32 32 0 1 1 12 26" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M40 2 L48 8 L40 14 Z" fill="currentColor" />
      </svg>
      <span className="text-xl font-light">10</span>
    </button>
  );
}

type SubSel = { kind: "int" | "ext"; idx: number } | null;
interface Track {
  key: string;
  label: string;
  sel: SubSel;
}

interface Props {
  title: Title;
  episode: Episode;
  startAt: number;
  broadcast: boolean;
  next?: Episode | undefined;
  prev?: Episode | undefined;
  onClose: () => void;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
  onRandom: () => void;
  /** oculto mientras se ve en la ventana flotante (PiP) */
  hidden?: boolean | undefined;
  onMinimize?: (() => void) | undefined;
  onRestore?: (() => void) | undefined;
}
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/** Chromium puede exponer las pistas de audio del MKV (flag AudioVideoTracks) y cambiarlas sin recodificar. */
const AUDIO_API =
  typeof HTMLMediaElement !== "undefined" && "audioTracks" in HTMLMediaElement.prototype;
function applyAudio(v: HTMLVideoElement, i: number, count: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const at = (v as any).audioTracks;
  if (!at || at.length !== count || i >= at.length) return false;
  for (let k = 0; k < at.length; k++) at[k].enabled = k === i;
  return true;
}

const enc = (p: string) => {
  const bytes = new TextEncoder().encode(p);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function Player(props: Props) {
  return isEmbed(props.episode.url) ? <EmbedPlayer {...props} /> : <VideoPlayer {...props} />;
}

function VideoPlayer({
  title,
  episode,
  startAt,
  broadcast,
  next,
  prev,
  onClose,
  onNext,
  onPrev,
  onRandom,
  hidden = false,
  onMinimize,
  onRestore,
}: Props) {
  const store = useStore();
  const settings = store.settings;
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bridge = typeof window !== "undefined" ? window.nofufa : undefined;
  const desktop = !!bridge && !!episode.path;

  const [probe, setProbe] = useState<Probe | null | undefined>(desktop ? undefined : null);
  const [mode, setMode] = useState<"direct" | "stream">("direct");
  const [offset, setOffset] = useState(0); // inicio del flujo transcodificado
  const [audioIdx, setAudioIdx] = useState(0);
  const [sub, setSub] = useState<SubSel>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [local, setLocal] = useState(0); // currentTime del <video>
  const [vDur, setVDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(() => Number(localStorage.getItem("nofufa-vol") ?? 1));
  const [ui, setUi] = useState(true);
  const [fs, setFs] = useState(false);
  const [panel, setPanel] = useState<"" | "tracks" | "play" | "subs">("");
  const sync = store.sync[episode.id] ?? {};
  const subDelay = sync.sub ?? 0;
  const audioDelay = sync.audio ?? 0;
  const speed = settings.speed || 1;
  const [ad, setAd] = useState(0); // retardo negativo aplicado en el flujo de ffmpeg
  const [extraSubs, setExtraSubs] = useState<SubSource[]>([]);
  const [sprite, setSprite] = useState<Sprite | null>(null);
  const [pip, setPip] = useState(false);
  const [osd, setOsd] = useState("");
  const osdT = useRef(0);
  const scrobbled = useRef(false);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const extSubs = useMemo(
    () => [...(episode.subtitles ?? []), ...extraSubs],
    [episode.subtitles, extraSubs],
  );
  const flash = (t: string) => {
    setOsd(t);
    window.clearTimeout(osdT.current);
    osdT.current = window.setTimeout(() => setOsd(""), 1400);
  };
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [wm, setWm] = useState({ size: 0, left: 0, top: 0 });
  const [error, setError] = useState("");
  const [mErr, setMErr] = useState("");
  const [tx, setTx] = useState(false); // recodificación completa (último recurso)
  const pendingSeek = useRef<number | null>(startAt > 0 ? startAt : null);
  const hideT = useRef<number>(0);
  const lastSave = useRef(0);

  const time = mode === "stream" ? offset + local : local;

  /* ----- intro: huella de audio comparando con otros episodios de la temporada; AniSkip para anime ----- */
  const [intro, setIntro] = useState<{ s: number; e: number } | null>(null);
  useEffect(() => {
    setIntro(null);
    if (title.kind === "movie") return;
    let alive = true;
    const season = title.episodes
      .filter((e) => e.season === episode.season && e.path)
      .sort((a, b) => a.number - b.number);
    const i = season.findIndex((e) => e.id === episode.id);
    const others = [1, -1, 2, -2, 3, -3, 4, -4]
      .map((d) => season[i + d])
      .filter((e): e is Episode => !!e)
      .map((e) => e.path!);
    const aniskip = async () => {
      const mal = title.meta?.malId;
      if (!mal) return null;
      try {
        const r = await fetch(
          `https://api.aniskip.com/v2/skip-times/${mal}/${episode.number}?types[]=op&episodeLength=0`,
        );
        const j = await r.json();
        const op = j?.results?.find((x: { skipType: string }) => x.skipType === "op")?.interval;
        return op ? { s: op.startTime as number, e: op.endTime as number } : null;
      } catch {
        return null;
      }
    };
    (async () => {
      let r: { s: number; e: number } | null = null;
      if (bridge?.intro && episode.path && others.length)
        r = await bridge.intro(episode.path, others).catch(() => null);
      if (!r && title.kind === "anime") r = await aniskip();
      if (alive) setIntro(r);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);
  const dur = probe?.duration || vDur || 0;

  /* ----- análisis de pistas y elección de modo ----- */
  useEffect(() => {
    let alive = true;
    setError("");
    setMErr("");
    setTx(false);
    setCues([]);
    setSub(null);
    setExtraSubs([]);
    setSprite(null);
    scrobbled.current = false;
    setLocal(0);
    setVDur(0);
    setWaiting(true);
    pendingSeek.current = startAt > 0 ? startAt : null;
    if (!desktop) {
      setProbe(null);
      setMode("direct");
      setOffset(0);
      return;
    }
    setProbe(undefined);
    bridge!.probe(episode.path!).then((p) => {
      if (!alive) return;
      setProbe(p);
      let a = 0;
      if (p?.audio.length) {
        const want = langPrefs(store, title.id).audio;
        const f = p.audio.findIndex((x) => matchLang(want, x.lang, x.title));
        a =
          f >= 0
            ? f
            : Math.max(
                0,
                p.audio.findIndex((x) => x.default),
              );
      }
      setAudioIdx(a);
      const m = !p || (p.direct && (a === 0 || AUDIO_API)) ? "direct" : "stream";
      setMode(m);
      if (m === "stream") {
        setOffset(startAt > 0 ? startAt : 0);
        pendingSeek.current = null;
      } else setOffset(0);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);

  useEffect(
    () => () => {
      bridge?.stopStream();
    },
    [bridge],
  );

  const src = useMemo(() => {
    if (probe === undefined) return "";
    if (mode === "direct") return episode.url;
    return `${bridge?.mediaBase || "media:/"}/stream/${enc(episode.path!)}?t=${offset.toFixed(2)}&a=${audioIdx}&tx=${tx ? 1 : 0}${ad < 0 ? `&ad=${ad}` : ""}`;
  }, [probe, mode, offset, audioIdx, episode, tx, ad]);

  useStereoFix(video, src, { delay: Math.max(0, audioDelay), night: settings.nightMode });

  /* ----- retardo de audio negativo: se rehace el flujo con el audio adelantado ----- */
  const timeRef = useRef(0);
  useEffect(() => {
    if (!desktop || probe === undefined) return;
    const want = audioDelay < 0 ? audioDelay : 0;
    if (want === ad) return;
    const id = window.setTimeout(() => {
      setAd(want);
      if (want < 0 || mode === "stream") {
        setOffset(timeRef.current);
        setMode("stream");
        setWaiting(true);
      }
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioDelay, probe]);

  /* ----- velocidad conservando el tono ----- */
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = speed;
    v.preservesPitch = true;
  }, [speed, src]);

  /* ----- miniaturas de la barra (en segundo plano, tras arrancar) ----- */
  useEffect(() => {
    if (!desktop || !bridge?.seekSprite || !probe?.duration) return;
    let alive = true;
    const id = window.setTimeout(() => {
      bridge.seekSprite!(episode.path!, probe.duration).then((r) => alive && setSprite(r));
    }, 4000);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe]);

  /* ----- ventana flotante (PiP) ----- */
  const togglePip = useCallback(async () => {
    const v = video.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v) await v.requestPictureInPicture();
    } catch {
      flash("La ventana flotante no está disponible");
    }
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const enter = () => setPip(true);
    const leave = () => {
      setPip(false);
      if (hiddenRef.current) {
        if (v.paused) onClose();
        else onRestore?.();
      }
    };
    v.addEventListener("enterpictureinpicture", enter);
    v.addEventListener("leavepictureinpicture", leave);
    return () => {
      v.removeEventListener("enterpictureinpicture", enter);
      v.removeEventListener("leavepictureinpicture", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  const close = () => {
    if (document.pictureInPictureElement && onMinimize) onMinimize();
    else onClose();
  };

  /* ----- subtítulos ----- */
  const tracks: Track[] = useMemo(() => {
    const t: Track[] = [];
    probe?.subs.forEach((s, i) => {
      if (s.text)
        t.push({
          key: `i${i}`,
          label: [langName(s.lang) || `Pista ${i + 1}`, s.title, s.forced ? "forzados" : ""]
            .filter(Boolean)
            .join(" · "),
          sel: { kind: "int", idx: i },
        });
    });
    extSubs.forEach((s, i) =>
      t.push({ key: `e${i}`, label: `${s.label} (archivo)`, sel: { kind: "ext", idx: i } }),
    );
    return t;
  }, [probe, extSubs]);

  useEffect(() => {
    if (probe === undefined) return;
    const pref = langPrefs(store, title.id).sub;
    if (!pref) return;
    const fits = (t: Track) => {
      if (t.sel!.kind === "int") {
        const s = probe!.subs[t.sel!.idx]!;
        return matchLang(pref, s.lang, s.title) || t.label === pref;
      }
      const s = extSubs[t.sel!.idx]!;
      return matchLang(pref, s.lang, s.label) || t.label === pref;
    };
    const forced = (t: Track) => t.sel!.kind === "int" && probe!.subs[t.sel!.idx]!.forced;
    const m = tracks.find((t) => fits(t) && !forced(t)) ?? tracks.find(fits);
    if (m) setSub(m.sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, tracks]);

  useEffect(() => {
    if (!sub) {
      setCues([]);
      return;
    }
    let alive = true;
    const url =
      sub.kind === "ext"
        ? extSubs[sub.idx]!.url
        : `${bridge?.mediaBase || "media:/"}/sub/${enc(episode.path!)}?s=${probe!.subs[sub.idx]!.index}`;
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        if (alive) setCues(parseVtt(t));
      })
      .catch(() => alive && setCues([]));
    return () => {
      alive = false;
    };
  }, [sub, episode, probe, extSubs]);

  /* ----- controles ----- */
  const poke = useCallback(() => {
    setUi(true);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => {
      if (!video.current?.paused) {
        setUi(false);
        setPanel("");
      }
    }, 3200);
  }, []);
  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideT.current);
  }, [poke]);

  const seekTo = useCallback(
    (x: number) => {
      const v = video.current;
      const target = Math.max(0, Math.min(dur ? dur - 1 : x, x));
      if (mode === "stream") {
        // ¿cae dentro de lo ya cargado? entonces salto local
        const rel = target - offset;
        if (v && rel >= 0 && v.buffered.length && rel <= v.buffered.end(v.buffered.length - 1))
          v.currentTime = rel;
        else {
          setWaiting(true);
          setOffset(target);
          setLocal(0);
        }
      } else if (v) v.currentTime = target;
      poke();
    },
    [mode, offset, dur, poke],
  );

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  }, [poke]);

  const toggleFs = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* */
    }
  }, []);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const chooseAudio = (i: number) => {
    const at = time;
    setAudioIdx(i);
    actions.setPref(title.id, { audio: probe?.audio[i]?.lang });
    // reproducción directa: cambio instantáneo de pista dentro del propio MKV
    if (
      mode === "direct" &&
      video.current &&
      applyAudio(video.current, i, probe?.audio.length ?? 0)
    )
      return;
    const direct = !!probe?.direct && i === 0;
    setMode(direct ? "direct" : "stream");
    if (direct) pendingSeek.current = at;
    else setOffset(at);
    setWaiting(true);
  };
  const chooseSub = (t: Track | null) => {
    setSub(t?.sel ?? null);
    actions.setPref(title.id, {
      sub: t ? (t.sel!.kind === "int" ? probe!.subs[t.sel!.idx]!.lang || t.label : t.label) : "",
    });
  };

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") {
      e.preventDefault();
      toggle();
    } else if (k === "arrowleft" || k === "j") seekTo(time - 10);
    else if (k === "arrowright" || k === "l") seekTo(time + 10);
    else if (k === "arrowup") {
      e.preventDefault();
      setVol((x) => Math.min(1, x + 0.1));
      setMuted(false);
    } else if (k === "arrowdown") {
      e.preventDefault();
      setVol((x) => Math.max(0, x - 0.1));
    } else if (k === "m") setMuted((m) => !m);
    else if (k === "f") toggleFs();
    else if (k === "c") chooseSub(sub ? null : (tracks[0] ?? null));
    else if (k === "n" && next) onNext();
    else if (k === "b" && prev && onPrev) onPrev();
    else if (k === "r") onRandom();
    else if (k === "z" || k === "x") {
      const v = clampSync(subDelay + (k === "x" ? 0.1 : -0.1));
      actions.setSync(episode.id, { sub: v });
      flash(`Subtítulos ${v > 0 ? "+" : ""}${v.toFixed(1)} s`);
    } else if (k === "g" || k === "h") {
      const v = clampSync(audioDelay + (k === "h" ? 0.1 : -0.1));
      actions.setSync(episode.id, { audio: v });
      flash(`Audio ${v > 0 ? "+" : ""}${v.toFixed(1)} s`);
    } else if (k === "p") togglePip();
    else if (k === "escape") {
      if (panel) setPanel("");
      else if (!document.fullscreenElement) close();
    } else return;
    poke();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (hiddenRef.current) return;
      if (
        (e.target as HTMLElement)?.tagName === "INPUT" &&
        (e.target as HTMLInputElement).type !== "range"
      )
        return;
      keys.current(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    localStorage.setItem("nofufa-vol", String(vol));
    if (video.current) {
      video.current.muted = muted;
      video.current.volume = vol;
    }
  }, [muted, vol, src]);

  const layout = useCallback(() => {
    const b = box.current,
      v = video.current;
    if (b && v) setWm(watermarkRect(b.clientWidth, b.clientHeight, v.videoWidth, v.videoHeight));
  }, []);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(layout);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [layout]);

  /* ----- barra de progreso ----- */
  const bar = useRef<HTMLDivElement>(null);
  const tAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };

  const shown = drag ?? time;
  const pct = dur ? (shown / dur) * 100 : 0;
  const buffered = (() => {
    const v = video.current;
    if (!v || !v.buffered.length || !dur) return 0;
    return (((mode === "stream" ? offset : 0) + v.buffered.end(v.buffered.length - 1)) / dur) * 100;
  })();
  const remaining = dur - time;
  const showNextCard =
    !!next && settings.autoplayNext && dur > 60 && remaining < (settings.nextAt || 20) && remaining > 0;
  const showSkipIntro =
    settings.skipIntro && !!intro && time >= intro.s - 0.5 && time < intro.e - 1.5;
  const hd = probe?.height || video.current?.videoHeight || 0;
  const quality =
    hd >= 2000 ? "4K UHD" : hd >= 1000 ? "Full HD" : hd >= 700 ? "HD" : hd ? "SD" : "";
  const label = title.kind === "movie" ? "" : `T${episode.season} E${episode.number}`;
  const lines = activeCues(cues, time - subDelay);
  timeRef.current = time;
  const chapters = (probe?.chapters ?? []).filter((c) => c.end > c.start);

  return (
    <div
      className={`fixed inset-0 z-50 bg-scrim text-overlay-foreground ${hidden ? "pointer-events-none invisible" : ""}`}
      aria-hidden={hidden || undefined}
      onMouseMove={poke}
      style={{ cursor: ui ? "default" : "none" }}
    >
      <div ref={box} className="absolute inset-0">
        {src && (
          <video
            key={src}
            ref={video}
            src={src}
            autoPlay
            crossOrigin={src.startsWith("http") ? "anonymous" : undefined}
            className="size-full object-contain"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setVDur(isFinite(v.duration) ? v.duration : 0);
              const startT = pendingSeek.current ?? 0;
              if (pendingSeek.current != null && mode === "direct") {
                v.currentTime = Math.min(pendingSeek.current, (v.duration || 1e9) * 0.97);
                pendingSeek.current = null;
              }
              v.volume = vol;
              v.muted = muted;
              v.playbackRate = speed;
              v.preservesPitch = true;
              layout();
              if (
                mode === "direct" &&
                audioIdx > 0 &&
                !applyAudio(v, audioIdx, probe?.audio.length ?? 0)
              ) {
                // este Chromium no expone pistas: pasar al flujo con la pista pedida
                setOffset(startT);
                setMode("stream");
                setWaiting(true);
              }
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setLocal(v.currentTime);
              const lt = (mode === "stream" ? offset : 0) + v.currentTime;
              if (Date.now() - lastSave.current > 4000 && dur) {
                lastSave.current = Date.now();
                actions.setProgress(episode.id, title.id, lt, dur);
              }
              if (!scrobbled.current && shouldScrobble(lt, dur) && bridge?.scrobble) {
                scrobbled.current = true;
                bridge
                  .scrobble({
                    kind: title.kind,
                    title: title.meta?.title ?? title.name,
                    year: title.meta?.year ?? "",
                    imdbId: title.meta?.imdbId,
                    anilistId: title.meta?.anilistId,
                    season: episode.season,
                    episode: episode.number,
                  })
                  .then((r) => {
                    const ok = [r.trakt && "Trakt", r.anilist && "AniList"].filter(Boolean);
                    if (ok.length) flash(`Marcado como visto en ${ok.join(" y ")}`);
                  })
                  .catch(() => {});
              }
            }}
            onWaiting={() => setWaiting(true)}
            onSeeking={() => setWaiting(true)}
            onPlaying={() => {
              setWaiting(false);
              setPlaying(true);
            }}
            onCanPlay={() => setWaiting(false)}
            onSeeked={() => setWaiting(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              setUi(true);
            }}
            onEnded={() => {
              if (dur) actions.setProgress(episode.id, title.id, dur, dur);
              if (next) onNext();
              else setUi(true);
            }}
            onError={(e) => {
              const er = e.currentTarget.error;
              if (er)
                setMErr(
                  `${mode}${tx ? "+tx" : ""} · código ${er.code}${er.message ? ` · ${er.message}` : ""}`,
                );
              setWaiting(true);
              if (mode === "direct" && desktop && probe !== undefined) {
                setOffset(time);
                setMode("stream");
              } else if (mode === "stream" && !tx && desktop) {
                setOffset(time); // reintento recodificando vídeo y audio
                setTx(true);
              } else {
                setError("No se puede reproducir este archivo.");
                bridge?.lastError?.().then((t) => t && setMErr((m) => `${m}\n${t}`));
              }
            }}
          />
        )}
        {settings.showWatermark && broadcast && wm.size > 0 && (
          <img
            src={watermark}
            alt=""
            aria-hidden
            className="pointer-events-none absolute select-none opacity-70"
            style={{ width: wm.size, height: wm.size, left: wm.left, top: wm.top }}
          />
        )}
        {lines.length > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1 px-[10%] text-center transition-all ${ui ? "bottom-36" : "bottom-14"}`}
          >
            {lines.map((c, i) => (
              <p
                key={i}
                className="subtitle-line whitespace-pre-line"
                dangerouslySetInnerHTML={{ __html: c.text.replace(/&(?![a-z]+;)/g, "&amp;") }}
              />
            ))}
          </div>
        )}
      </div>

      {(waiting || probe === undefined) && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-16 animate-spin text-overlay-foreground/80" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-scrim/60">
          <div className="max-w-md rounded-lg bg-popover p-6 text-center text-popover-foreground">
            <p className="text-lg font-semibold">{error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Hemos probado a verlo directo y convertido, sin éxito. Revisa que el archivo no esté dañado.
            </p>
            {desktop && probe === null && (
              <p className="mt-2 text-xs text-muted-foreground">
                No se pudo analizar el archivo: ffprobe/ffmpeg no responde.
              </p>
            )}
            {mErr && <p className="mt-2 whitespace-pre-line break-words text-xs text-muted-foreground">{mErr}</p>}
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => {
                  setError("");
                  setMErr("");
                  setTx(false);
                  setOffset(time);
                  setMode(desktop ? "stream" : "direct");
                  setWaiting(true);
                }}
                className="rounded bg-secondary px-4 py-2 text-sm font-semibold"
              >
                Reintentar
              </button>
              <button
                onClick={onClose}
                className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 transition-opacity duration-300 ${ui ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div
          className="absolute inset-0"
          onClick={() => (panel ? setPanel("") : toggle())}
          onDoubleClick={toggleFs}
        />
        <div className="bg-player-top pointer-events-none absolute inset-x-0 top-0 h-40" />
        <div className="bg-player-bottom pointer-events-none absolute inset-x-0 bottom-0 h-56" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-6 px-4 pt-4 sm:px-10 sm:pt-8">
          <button
            onClick={close}
            aria-label="Volver"
            className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-overlay-foreground/10"
          >
            <ArrowLeft className="size-7" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            {broadcast && (
              <p className="mb-1 inline-flex items-center gap-1.5 rounded bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-primary-foreground">
                <Radio className="size-3.5" /> Emisión aleatoria
              </p>
            )}
            <h1 className="truncate text-2xl font-bold">{title.meta?.title ?? title.name}</h1>
            {title.kind !== "movie" && (
              <p className="truncate text-lg text-overlay-foreground/80">
                {label} · {episodeTitle(title, episode)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="group flex items-center gap-2">
              <input
                aria-label="Volumen"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : vol}
                onChange={(e) => {
                  setVol(+e.target.value);
                  setMuted(false);
                }}
                className="range-tv w-0 opacity-0 transition-all group-hover:w-24 group-hover:opacity-100"
              />
              <button onClick={() => setMuted((m) => !m)} aria-label="Silencio">
                {muted || vol === 0 ? (
                  <VolumeX className="size-7" />
                ) : (
                  <Volume2 className="size-7" />
                )}
              </button>
            </div>
            <button
              onClick={() => setPanel((p) => (p === "tracks" ? "" : "tracks"))}
              aria-label="Audio y subtítulos"
              title="Audio y subtítulos"
              className={panel === "tracks" || panel === "subs" ? "text-primary-glow" : ""}
            >
              <Captions className="size-7" />
            </button>
            <button
              onClick={() => setPanel((p) => (p === "play" ? "" : "play"))}
              aria-label="Velocidad y sincronización"
              title="Velocidad, sincronización y modo nocturno"
              className={panel === "play" ? "text-primary-glow" : ""}
            >
              <Gauge className="size-7" />
            </button>
            <button
              onClick={togglePip}
              aria-label="Ventana flotante"
              title="Ventana flotante (P)"
              className={pip ? "text-primary-glow" : ""}
            >
              <PictureInPicture2 className="size-7" />
            </button>
            <button onClick={toggleFs} aria-label="Pantalla completa">
              {fs ? <Minimize2 className="size-7" /> : <Maximize2 className="size-7" />}
            </button>
          </div>
        </div>

        {panel === "play" && (
          <PlayPanel
            speed={speed}
            subDelay={subDelay}
            audioDelay={audioDelay}
            night={settings.nightMode}
            desktop={desktop}
            onSpeed={(v) => actions.setSettings({ speed: v })}
            onSub={(v) => actions.setSync(episode.id, { sub: clampSync(v) })}
            onAudio={(v) => actions.setSync(episode.id, { audio: clampSync(v) })}
            onNight={(v) => actions.setSettings({ nightMode: v })}
            chapters={chapters}
            onChapter={(t) => seekTo(t + 0.1)}
          />
        )}
        {panel === "subs" && (
          <SubsPanel
            title={title}
            episode={episode}
            onBack={() => setPanel("tracks")}
            onLoaded={(s) => {
              setExtraSubs((x) => [...x, s]);
              const idx = (episode.subtitles?.length ?? 0) + extraSubs.length;
              setSub({ kind: "ext", idx });
              setPanel("");
              flash("Subtítulos cargados");
            }}
          />
        )}
        {panel === "tracks" && (
          <div
            className="absolute right-2 top-20 sm:right-10 sm:top-24 z-10 flex max-h-[70vh] w-[min(34rem,calc(100vw-1rem))] gap-6 overflow-auto rounded-xl bg-popover/95 p-5 text-sm text-popover-foreground shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Audio
              </p>
              {!probe?.audio.length && (
                <p className="px-2 py-1.5 text-muted-foreground">
                  {desktop ? "Pista única" : "Pista original"}
                </p>
              )}
              {probe?.audio.map((a, i) => (
                <button
                  key={i}
                  onClick={() => chooseAudio(i)}
                  className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${i === audioIdx ? "font-bold text-primary-glow" : ""}`}
                >
                  {langName(a.lang) || `Pista ${i + 1}`}
                  {a.title ? ` · ${a.title}` : ""}{" "}
                  <span className="text-xs text-muted-foreground">
                    {a.codec?.toUpperCase()}{" "}
                    {a.channels > 2
                      ? `${a.channels === 6 ? "5.1" : a.channels === 8 ? "7.1" : a.channels + "ch"}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex-1">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Subtítulos
              </p>
              <button
                onClick={() => chooseSub(null)}
                className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${!sub ? "font-bold text-primary-glow" : ""}`}
              >
                Desactivados
              </button>
              {tracks.map((t) => (
                <button
                  key={t.key}
                  onClick={() => chooseSub(t)}
                  className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${sub && sub.kind === t.sel!.kind && sub.idx === t.sel!.idx ? "font-bold text-primary-glow" : ""}`}
                >
                  {t.label}
                </button>
              ))}
              {probe?.subs.some((s) => !s.text) && (
                <p className="mt-2 px-2 text-xs text-muted-foreground">
                  Hay subtítulos en imagen (PGS/DVD) que no se pueden mostrar encima del vídeo.
                </p>
              )}
              <div className="mt-4 space-y-1 border-t pt-3">
                {desktop && bridge?.subsSearch && (
                  <button
                    onClick={() => setPanel("subs")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 font-semibold text-primary-glow hover:bg-accent"
                  >
                    <Search className="size-4" /> Buscar subtítulos en internet
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-24">
          <div className="pointer-events-auto">
            <Skip dir={-1} onClick={() => seekTo(time - 10)} />
          </div>
          <button
            onClick={toggle}
            aria-label={playing ? "Pausa" : "Reproducir"}
            className="pointer-events-auto grid size-24 place-items-center rounded-full transition hover:scale-105 hover:bg-overlay-foreground/10"
          >
            {playing ? (
              <Pause className="size-16 fill-current" />
            ) : (
              <Play className="size-16 fill-current" />
            )}
          </button>
          <div className="pointer-events-auto">
            <Skip dir={1} onClick={() => seekTo(time + 10)} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-10 sm:pb-8">
          <div
            ref={bar}
            className="group relative h-6 cursor-pointer touch-none"
            onPointerDown={(e) => {
              if (!dur) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag(tAt(e.clientX));
            }}
            onPointerMove={(e) => {
              if (!dur) return;
              const t = tAt(e.clientX);
              const r = bar.current!.getBoundingClientRect();
              setHover({ x: e.clientX - r.left, t });
              if (drag != null) setDrag(t);
            }}
            onPointerUp={(e) => {
              if (drag != null) {
                seekTo(tAt(e.clientX));
                setDrag(null);
              }
            }}
            onPointerLeave={() => setHover(null)}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-overlay-foreground/25 transition-all group-hover:h-1.5" />
            <div
              className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded bg-overlay-foreground/40 group-hover:h-1.5"
              style={{ width: `${Math.min(100, buffered)}%` }}
            />
            <div
              className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded bg-primary group-hover:h-1.5"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-overlay-foreground shadow transition group-hover:scale-125"
              style={{ left: `${pct}%` }}
            />
            {dur > 0 &&
              chapters.length > 1 &&
              chapters.slice(1).map((c, i) => (
                <span
                  key={i}
                  className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-overlay-foreground/80"
                  style={{ left: `${(c.start / dur) * 100}%` }}
                />
              ))}
            {hover && sprite && (
              <div
                className="pointer-events-none absolute bottom-10 -translate-x-1/2 overflow-hidden rounded border-2 border-overlay-foreground/80 bg-scrim shadow-2xl"
                style={{
                  left: hover.x,
                  width: sprite.w * 1.5,
                  height: sprite.h * 1.5,
                  backgroundImage: `url("${sprite.url}")`,
                  backgroundSize: `${sprite.cols * sprite.w * 1.5}px ${sprite.rows * sprite.h * 1.5}px`,
                  backgroundPosition: (() => {
                    const n = Math.min(
                      sprite.cols * sprite.rows - 1,
                      Math.floor(hover.t / sprite.interval),
                    );
                    return `-${(n % sprite.cols) * sprite.w * 1.5}px -${Math.floor(n / sprite.cols) * sprite.h * 1.5}px`;
                  })(),
                }}
              />
            )}
            {hover && (
              <span
                className="absolute -top-8 -translate-x-1/2 rounded bg-popover px-2 py-0.5 text-sm font-semibold tabular-nums text-popover-foreground"
                style={{ left: hover.x }}
              >
                {fmt(hover.t)}
                {(() => {
                  const c = chapters.find((x) => hover.t >= x.start && hover.t < x.end);
                  return c && chapters.length > 1 ? ` · ${c.title}` : "";
                })()}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-lg">
            <div className="flex items-center gap-5">
              <span className="tabular-nums">
                {fmt(shown)} <span className="text-overlay-foreground/60">/ {fmt(dur)}</span>
              </span>
              {quality && (
                <span className="rounded border border-overlay-foreground/40 px-1.5 text-xs font-bold">
                  {quality}
                </span>
              )}
              {mode === "stream" && (
                <span className="text-xs text-overlay-foreground/60">Convertido al vuelo</span>
              )}
            </div>
            <div className="flex items-center gap-6">
              {prev && onPrev && (
                <button
                  onClick={onPrev}
                  className="flex items-center gap-1 font-medium text-overlay-foreground/90 hover:text-overlay-foreground"
                >
                  <ChevronLeft className="size-5" /> {broadcast ? "Anterior" : "Episodio anterior"}
                </button>
              )}
              {next && (
                <button
                  onClick={onNext}
                  className="flex items-center gap-1 font-medium text-overlay-foreground/90 hover:text-overlay-foreground"
                >
                  {broadcast ? "Siguiente aleatorio" : "Siguiente episodio"}{" "}
                  <ChevronRight className="size-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {osd && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-lg bg-popover/90 px-4 py-2 text-lg font-semibold text-popover-foreground">
          {osd}
        </div>
      )}
      {showSkipIntro && (
        <button
          onClick={() => intro && seekTo(intro.e)}
          className="absolute bottom-32 right-4 sm:bottom-40 sm:right-10 rounded-md border border-overlay-foreground/50 bg-scrim/60 px-5 py-2.5 font-semibold backdrop-blur hover:bg-overlay-foreground hover:text-scrim"
        >
          Saltar intro
        </button>
      )}
      {showNextCard && next && (
        <div className="absolute bottom-32 right-4 sm:bottom-40 sm:right-10 w-80 overflow-hidden rounded-lg bg-popover/95 text-popover-foreground shadow-2xl">
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {broadcast ? "A continuación" : "Siguiente episodio"} en {Math.ceil(remaining)} s
            </p>
            <p className="mt-1 truncate font-semibold">
              {next.titleId !== title.id ? "" : `T${next.season} E${next.number} · `}
              {next.name}
            </p>
          </div>
          <button
            onClick={onNext}
            className="flex w-full items-center justify-center gap-2 bg-primary py-2.5 font-semibold text-primary-foreground"
          >
            <SkipForward className="size-4" /> Reproducir ahora
          </button>
        </div>
      )}
    </div>
  );
}

function Step({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value > 0 ? "+" : ""}
          {value.toFixed(1)} s
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => onChange(value - 0.1)}
          className="rounded bg-secondary px-2 py-0.5 font-bold"
          aria-label={`${label} -0,1 s`}
        >
          −
        </button>
        <input
          type="range"
          min={-5}
          max={5}
          step={0.1}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          className="flex-1 accent-[var(--primary)]"
          aria-label={label}
        />
        <button
          onClick={() => onChange(value + 0.1)}
          className="rounded bg-secondary px-2 py-0.5 font-bold"
          aria-label={`${label} +0,1 s`}
        >
          +
        </button>
        <button onClick={() => onChange(0)} className="text-xs text-muted-foreground hover:underline">
          0
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function PlayPanel(p: {
  speed: number;
  subDelay: number;
  audioDelay: number;
  night: boolean;
  desktop: boolean;
  onSpeed: (v: number) => void;
  onSub: (v: number) => void;
  onAudio: (v: number) => void;
  onNight: (v: boolean) => void;
  chapters: { start: number; title: string }[];
  onChapter: (t: number) => void;
}) {
  return (
    <div
      className="absolute right-2 top-20 sm:right-10 sm:top-24 z-10 max-h-[72vh] w-[min(26rem,calc(100vw-1rem))] space-y-5 overflow-auto rounded-xl bg-popover/95 p-5 text-sm text-popover-foreground shadow-2xl backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Velocidad
        </p>
        <div className="flex gap-1.5">
          {SPEEDS.map((v) => (
            <button
              key={v}
              onClick={() => p.onSpeed(v)}
              className={`flex-1 rounded px-2 py-1.5 font-semibold ${p.speed === v ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Sincronización
        </p>
        <Step label="Subtítulos" value={p.subDelay} onChange={p.onSub} hint="Teclas Z / X · positivo = salen más tarde" />
        <Step
          label="Audio"
          value={p.audioDelay}
          onChange={p.onAudio}
          hint={
            p.desktop
              ? "Teclas G / H · positivo = el sonido va más tarde"
              : "Teclas G / H · en la versión web solo valores positivos"
          }
        />
      </div>
      <button
        onClick={() => p.onNight(!p.night)}
        className="flex w-full items-center justify-between rounded-lg bg-secondary px-3 py-2.5"
      >
        <span className="flex items-center gap-2 text-left">
          <Moon className="size-4" />
          <span>
            <span className="block font-semibold">Modo nocturno</span>
            <span className="block text-xs text-muted-foreground">
              Baja explosiones y música, voces más claras
            </span>
          </span>
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${p.night ? "bg-primary text-primary-foreground" : "bg-background"}`}>
          {p.night ? "SÍ" : "NO"}
        </span>
      </button>
      {p.chapters.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Capítulos
          </p>
          {p.chapters.map((c, i) => (
            <button
              key={i}
              onClick={() => p.onChapter(c.start)}
              className="flex w-full justify-between rounded px-2 py-1.5 text-left hover:bg-accent"
            >
              <span className="truncate">{c.title}</span>
              <span className="tabular-nums text-muted-foreground">{fmt(c.start)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubsPanel({
  title,
  episode,
  onBack,
  onLoaded,
}: {
  title: Title;
  episode: Episode;
  onBack: () => void;
  onLoaded: (s: SubSource) => void;
}) {
  const b = window.nofufa!;
  const movie = title.kind === "movie" || title.episodes.length === 1;
  const [q, setQ] = useState(title.meta?.title ?? title.name);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SubResult[] | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [dl, setDl] = useState("");
  const search = async (useId: boolean) => {
    setBusy(true);
    setErrs([]);
    try {
      const r = await b.subsSearch!({
        query: q,
        movie,
        season: movie ? undefined : episode.season,
        episode: movie ? undefined : episode.number,
        imdbId: useId ? title.meta?.imdbId : undefined,
      });
      setRes(r.results);
      setErrs(r.errors);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className="absolute right-2 top-20 sm:right-10 sm:top-24 z-10 flex max-h-[72vh] w-[min(34rem,calc(100vw-1rem))] flex-col rounded-xl bg-popover/95 p-5 text-sm text-popover-foreground shadow-2xl backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} aria-label="Atrás" className="rounded p-1 hover:bg-accent">
          <ArrowLeft className="size-4" />
        </button>
        <p className="font-bold">
          Subtítulos de internet {!movie && `· T${episode.season} E${episode.number}`}
        </p>
      </div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(false);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded bg-secondary px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary"
          placeholder="Título"
        />
        <button className="rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
          Buscar
        </button>
      </form>
      {errs.map((e, i) => (
        <p key={i} className="mb-1 text-xs text-destructive">
          {e}
        </p>
      ))}
      <div className="-mx-1 flex-1 overflow-auto">
        {busy && <Loader2 className="mx-auto my-6 size-6 animate-spin" />}
        {!busy && res?.length === 0 && (
          <p className="px-1 py-4 text-muted-foreground">No se han encontrado subtítulos.</p>
        )}
        {!busy &&
          res?.map((r) => (
            <div key={r.provider + r.id} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-accent">
              <span className="w-8 shrink-0 rounded bg-secondary text-center text-xs font-bold uppercase">
                {r.lang.slice(0, 2) || "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r.provider === "opensubtitles" ? "OpenSubtitles" : "SubDL"}
                  {r.downloads ? ` · ${r.downloads} descargas` : ""}
                </span>
              </span>
              <button
                disabled={!!dl}
                onClick={async () => {
                  setDl(r.id);
                  try {
                    const s = await b.subsDownload!(r, episode.path!);
                    if (s) onLoaded(s);
                  } catch (e) {
                    setErrs([String((e as Error).message ?? e)]);
                  } finally {
                    setDl("");
                  }
                }}
                className="flex shrink-0 items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {dl === r.id ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                Usar
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
