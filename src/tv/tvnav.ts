import { useEffect, useRef } from "react";

/**
 * Modo TV: flechas para moverse entre botones (navegación espacial) y mando
 * (Xbox / PlayStation) mediante la Gamepad API. El mando funciona siempre;
 * la navegación con flechas solo en modo TV y fuera del reproductor.
 */
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && !el.closest("[aria-hidden='true']");
}

export function moveFocus(dir: "up" | "down" | "left" | "right") {
  const scope =
    (document.querySelector('[role="dialog"], .tv-modal') as HTMLElement | null) ?? document.body;
  const all = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || cur === document.body || !all.includes(cur)) {
    all[0]?.focus();
    all[0]?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2,
    ay = a.top + a.height / 2;
  let best: HTMLElement | null = null,
    bd = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2,
      by = b.top + b.height / 2;
    const dx = bx - ax,
      dy = by - ay;
    const ok =
      dir === "right" ? dx > 4 : dir === "left" ? dx < -4 : dir === "down" ? dy > 4 : dy < -4;
    if (!ok) continue;
    const main = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const d = main + cross * 2.5;
    if (d < bd) {
      bd = d;
      best = el;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
}

const key = (k: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

export function useTvNavigation(opts: {
  enabled: boolean;
  playerOpen: boolean;
  onBack: () => void;
}) {
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    document.documentElement.classList.toggle("tv-mode", opts.enabled);
  }, [opts.enabled]);

  // flechas del teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const { enabled, playerOpen, onBack } = o.current;
      if (!enabled || playerOpen || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      const typing =
        (t?.tagName === "INPUT" && (t as HTMLInputElement).type !== "range") ||
        t?.tagName === "TEXTAREA";
      const dirs: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const d = dirs[e.key];
      if (d && !(typing && (d === "left" || d === "right")) && t?.tagName !== "SELECT") {
        e.preventDefault();
        moveFocus(d);
      } else if ((e.key === "Escape" || e.key === "Backspace") && !typing) {
        if (document.querySelector(".tv-modal")) return; // la ventana abierta se cierra sola
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // mando: cruceta / stick → flechas, A → Intro/espacio, B → Escape
  useEffect(() => {
    let raf = 0;
    const prev: Record<string, boolean> = {};
    let repeatAt: Record<string, number> = {};
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const pads = navigator.getGamepads?.() ?? [];
      const gp = [...pads].find(Boolean);
      if (!gp) return;
      const ax = gp.axes[0] ?? 0,
        ay = gp.axes[1] ?? 0;
      const st: Record<string, boolean> = {
        up: !!gp.buttons[12]?.pressed || ay < -0.6,
        down: !!gp.buttons[13]?.pressed || ay > 0.6,
        left: !!gp.buttons[14]?.pressed || ax < -0.6,
        right: !!gp.buttons[15]?.pressed || ax > 0.6,
        a: !!gp.buttons[0]?.pressed,
        b: !!gp.buttons[1]?.pressed,
        start: !!gp.buttons[9]?.pressed,
      };
      const now = performance.now();
      for (const k of Object.keys(st)) {
        const down = st[k]!;
        const first = down && !prev[k];
        const rep = down && prev[k] && ["up", "down", "left", "right"].includes(k) && now > (repeatAt[k] ?? 0);
        if (first || rep) {
          repeatAt[k] = now + (first ? 450 : 140);
          const { playerOpen } = o.current;
          if (k === "a") {
            if (playerOpen) key(" ");
            else (document.activeElement as HTMLElement | null)?.click();
          } else if (k === "b") key("Escape");
          else if (k === "start") key(playerOpen ? " " : "Enter");
          else {
            const map: Record<string, string> = {
              up: "ArrowUp",
              down: "ArrowDown",
              left: "ArrowLeft",
              right: "ArrowRight",
            };
            if (playerOpen || !o.current.enabled) key(map[k]!);
            else moveFocus(k as "up" | "down" | "left" | "right");
          }
        }
        prev[k] = down;
      }
    };
    const start = () => {
      cancelAnimationFrame(raf);
      repeatAt = {};
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("gamepadconnected", start);
    if ([...(navigator.getGamepads?.() ?? [])].some(Boolean)) start();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", start);
    };
  }, []);
}
