import { useEffect, useRef, type RefObject } from "react";

let ctx: AudioContext | null = null;

/**
 * Si un vídeo solo suena por un lado (L o R en silencio), copia el canal que suena a los dos oídos.
 * El audio normal en estéreo no se toca; 5.1/7.1 se mezcla a estéreo antes de analizar.
 */
export interface AudioFx {
  /** retardo del audio en segundos (solo positivo: el negativo se hace en ffmpeg) */
  delay: number;
  /** modo nocturno: compresor + realce de voces */
  night: boolean;
}
interface FxNodes {
  delay: DelayNode;
  dry: GainNode;
  wet: GainNode;
  ctx: AudioContext;
}
function applyFx(n: FxNodes | null, o: AudioFx) {
  if (!n) return;
  const t = n.ctx.currentTime;
  n.delay.delayTime.setTargetAtTime(Math.max(0, Math.min(10, o.delay)), t, 0.02);
  n.dry.gain.setTargetAtTime(o.night ? 0 : 1, t, 0.05);
  n.wet.gain.setTargetAtTime(o.night ? 1 : 0, t, 0.05);
}

export function useStereoFix(
  video: RefObject<HTMLVideoElement | null>,
  src: string,
  fx: AudioFx = { delay: 0, night: false },
) {
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const nodes = useRef<FxNodes | null>(null);
  useEffect(() => applyFx(nodes.current, fx), [fx.delay, fx.night]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    try {
      ctx ??= new AudioContext();
    } catch {
      return;
    }
    const c = ctx;
    let node: MediaElementAudioSourceNode;
    try {
      node = c.createMediaElementSource(v);
    } catch {
      return;
    }
    const pre = c.createGain();
    pre.channelCount = 2;
    pre.channelCountMode = "explicit";
    pre.channelInterpretation = "speakers";
    const split = c.createChannelSplitter(2);
    const merge = c.createChannelMerger(2);
    // g[desde][hacia]
    const g = [0, 1].map(() => [0, 1].map(() => c.createGain()));
    node.connect(pre).connect(split);
    for (const from of [0, 1])
      for (const to of [0, 1]) {
        split.connect(g[from]![to]!, from);
        g[from]![to]!.connect(merge, 0, to);
        g[from]![to]!.gain.value = from === to ? 1 : 0;
      }
    // retardo + modo nocturno (rama seca / rama comprimida)
    const delay = c.createDelay(10);
    const dry = c.createGain();
    const wet = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -32;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const voice = c.createBiquadFilter();
    voice.type = "peaking";
    voice.frequency.value = 2500;
    voice.Q.value = 0.8;
    voice.gain.value = 5;
    const makeup = c.createGain();
    makeup.gain.value = 1.8;
    merge.connect(delay);
    delay.connect(dry).connect(c.destination);
    delay.connect(comp).connect(voice).connect(makeup).connect(wet).connect(c.destination);
    nodes.current = { delay, dry, wet, ctx: c };
    dry.gain.value = fxRef.current.night ? 0 : 1;
    wet.gain.value = fxRef.current.night ? 1 : 0;
    delay.delayTime.value = Math.max(0, Math.min(10, fxRef.current.delay));
    const an = [0, 1].map((ch) => {
      const a = c.createAnalyser();
      a.fftSize = 1024;
      split.connect(a, ch);
      return a;
    });
    const buf = new Float32Array(1024);
    const rms = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
      return Math.sqrt(s / buf.length);
    };
    let score = 0; // >0: solo izquierda, <0: solo derecha
    let mode = 0;
    const iv = window.setInterval(() => {
      if (c.state === "suspended" && !v.paused) c.resume().catch(() => {});
      if (v.paused) return;
      const l = rms(an[0]!),
        r = rms(an[1]!);
      const hi = Math.max(l, r);
      if (hi < 0.003) return; // silencio: no decidir
      if (r < l * 0.05) score = Math.min(score + 1, 8);
      else if (l < r * 0.05) score = Math.max(score - 1, -8);
      else score += score > 0 ? -1 : score < 0 ? 1 : 0;
      const want = score >= 4 ? 1 : score <= -4 ? -1 : score === 0 ? 0 : mode;
      if (want === mode) return;
      mode = want;
      const set = (from: number, to: number, x: number) =>
        g[from]![to]!.gain.setTargetAtTime(x, c.currentTime, 0.05);
      set(0, 0, mode >= 0 ? 1 : 0);
      set(0, 1, mode === 1 ? 1 : 0);
      set(1, 1, mode <= 0 ? 1 : 0);
      set(1, 0, mode === -1 ? 1 : 0);
    }, 250);
    return () => {
      window.clearInterval(iv);
      try {
        node.disconnect();
        merge.disconnect();
        delay.disconnect();
        wet.disconnect();
        dry.disconnect();
        nodes.current = null;
      } catch {
        /* */
      }
    };
  }, [video, src]);
}
