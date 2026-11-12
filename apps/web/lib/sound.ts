/** Optional procedural sound (WebAudio, no assets). Off by default; the player opts in. */
let ctx: AudioContext | null = null;
export let soundOn = false;
export function setSound(on: boolean) {
  soundOn = on;
  if (on && !ctx) ctx = new AudioContext();
}
export function boom() {
  if (!soundOn || !ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.9);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1200, t);
  lp.frequency.exponentialRampToValueAtTime(80, t + 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(t);
}
export function chime() {
  if (!soundOn || !ctx) return;
  const t = ctx.currentTime;
  [660, 990].forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.08 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.35);
    o.connect(g).connect(ctx!.destination);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + 0.4);
  });
}
