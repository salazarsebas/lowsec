/** Sound helper. Kenney CC0 samples in public/sfx (see public/sfx/LICENSE-kenney.txt) played
 *  through WebAudio, with procedural fallbacks if a file can't be decoded.
 *  Default ON, but browsers only allow audio after a user gesture, so the AudioContext is created
 *  on the first pointer/key interaction. The mute choice persists in localStorage ("lowsec.sound").
 *
 *  API: sfx(name, {volume, rate}) · setSound(on) · soundOn · onSoundChange(fn) · boom() · chime()
 */
export type SfxName = "hover" | "click" | "confirm" | "error" | "launch" | "arrive" | "alarm" | "explosion" | "coin";
export const SFX: SfxName[] = ["hover", "click", "confirm", "error", "launch", "arrive", "alarm", "explosion", "coin"];
const VOL: Record<SfxName, number> = { hover: 0.15, click: 0.35, confirm: 0.5, error: 0.45, launch: 0.5, arrive: 0.55, alarm: 0.5, explosion: 0.9, coin: 0.35 };
const KEY = "lowsec.sound";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers: Partial<Record<SfxName, AudioBuffer>> = {};
const listeners = new Set<(on: boolean) => void>();
export let soundOn = typeof window === "undefined" ? false : localStorage.getItem(KEY) !== "off";

function unlock() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      SFX.forEach((n) =>
        fetch(`/sfx/${n}.ogg`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).then((buf) => (buffers[n] = buf)).catch(() => {}),
      );
    } catch {
      ctx = null;
    }
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}
if (typeof window !== "undefined") {
  const first = () => (soundOn && unlock(), window.removeEventListener("pointerdown", first), window.removeEventListener("keydown", first));
  window.addEventListener("pointerdown", first);
  window.addEventListener("keydown", first);
}

export function setSound(on: boolean) {
  soundOn = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (on) unlock();
  listeners.forEach((f) => f(on));
}
export function onSoundChange(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Play a cue. rate > 1 raises pitch (use for rising coin ticks). Silently no-ops when muted/locked. */
export function sfx(name: SfxName, opts: { volume?: number; rate?: number } = {}) {
  if (!soundOn || !ctx || !master || ctx.state !== "running") return;
  const buf = buffers[name];
  if (!buf) return fallback(name);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = ctx.createGain();
  g.gain.value = (opts.volume ?? 1) * VOL[name];
  src.connect(g).connect(master);
  src.start();
}

function fallback(name: SfxName) {
  if (name === "explosion" || name === "alarm") return noiseBoom();
  if (name === "arrive" || name === "confirm" || name === "coin") return tones(name === "coin" ? [1320] : [660, 990]);
  if (name === "error") return tones([220, 165]);
  return tones([1800], 0.03, 0.05);
}
function tones(fs: number[], peak = 0.2, len = 0.35) {
  const c = ctx!, t = c.currentTime;
  fs.forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(peak, t + i * 0.08 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + len);
    o.connect(g).connect(master!);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + len + 0.05);
  });
}
function noiseBoom() {
  const c = ctx!, t = c.currentTime, len = Math.floor(c.sampleRate * 0.9);
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1200, t);
  lp.frequency.exponentialRampToValueAtTime(80, t + 0.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  src.connect(lp).connect(g).connect(master!);
  src.start(t);
}

/** Back-compat cues used by page.tsx: ambush (alarm + explosion) and arrival. */
export function boom() {
  sfx("alarm");
  setTimeout(() => sfx("explosion"), 90);
}
export function chime() {
  sfx("arrive");
}
