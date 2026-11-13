// Cuts demo/raw/*.webm by the beat marks, adds title cards + captions and concatenates into
// demo/lowsec-demo-silent.mp4 (1920x1080, 30 fps, H.264, no audio). Also writes demo/timeline.json.
// Layout: game footage is scaled into the top 1706x960 of the frame and the caption sits in its own
// 120 px band underneath, so captions never cover the dock. `crop` zooms into the action (x:y:w:h are
// in 1920x1080 source px, always 16:9). Honesty markers: a sped-up clip shows "N× speed", and a cut
// wait shows ">> N s skipped (testnet latency)" for the first 2 s after the cut.
// Usage (repo root): node demo/assemble.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const RAW = "demo/raw", SEG = "demo/raw/seg";
mkdirSync(SEG, { recursive: true });
const m = JSON.parse(readFileSync(`${RAW}/marks.json`, "utf8"));
const runs = Object.keys(m).filter((k) => /^depart\d+$/.test(k)).map((k) => Number(k.slice(6)));
const K = Math.max(...runs.filter((r) => m[`depart${r}`] < m.ambush));
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf";
const TEE = process.env.TEE === "1";

// the convoy's wait for the chain: keep the departure and the ambush, cut the middle if it is long
const wait = m.ambush - m[`depart${K}`];
const ambushParts = wait > 14
  ? [[m[`depart${K}`], m[`depart${K}`] + 5], [m.ambush - 4, m.ambush_end]]
  : [[m[`depart${K}`], m.ambush_end]];

const plan = [
  { id: "hook", src: "main", from: m.ambush - 0.6, to: m.ambush + 4.4, dur: 5, crop: "1600:900:0:40", cap: "A real ambush on NEAR testnet: burned cargo is gone for good" },
  { id: "title", card: "title", dur: 6 },
  { id: "login", src: "main", from: m.login - 0.3, to: m.joined + 1.7, dur: 10, cap: "No wallet, no seed phrase, no gas: type a name and play" },
  { id: "haul", src: "main", from: m[`run${K}`], to: m[`depart${K}`], dur: 13, crop: "1440:810:0:270", cap: "Safe lane: slow, no risk. Lowsec: 3x faster, but raiders camp it" },
  { id: "ambush", src: "main", parts: ambushParts, crop: "1600:900:0:40", cap: "Ambushed: part of the cargo burns on-chain, part goes to the raider" },
  { id: "tooltip", src: "main", from: m.tooltip, to: m.tooltip_end, dur: 12, cap: TEE ? "4 AI traders: NEAR AI Cloud private TEE, attestation checked, decisions logged on-chain" : "4 AI traders: decisions logged on-chain (MOCK fallback until NEAR AI credits are active)" },
  { id: "report", src: "main", from: m.report, to: m.report_end, dur: 15, cap: "Economic Report from the contract · Council v0.4: one public rule, max 10%/epoch" },
  { id: "ff", src: "main", from: m.ff, to: m.ff_end, dur: 8, cap: "Fast-forward 4 weeks: live Council v0.4 vs v0.3 vs no Council, every metric" },
  { id: "agent", src: "agent", from: 0.4, to: 11.4, dur: 11, cap: "Real testnet run: an outside agent trading with its own NEAR account" },
  { id: "intents", src: "main", from: m.intents, to: m.intents_end, dur: 7, crop: "640:360:1280:720", cap: "NEAR Intents 1Click: live cross-chain deposit quote (quote only)" },
  ...(m.explorer ? [{ id: "explorer", src: "main", from: m.explorer - 1, to: m.explorer_end, dur: 8, crop: "1280:720:380:80", cap: "That ambush on a public explorer: cargo burned, loot sent to the raider" }] : []),
  { id: "close", card: "close", dur: 8 },
];

const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-an"];
const esc = (s) => s.replace(/:/g, "\\:");
function clip(s, from, to, dur, out, marker) {
  const len = to - from, speed = len / dur;
  writeFileSync(`${SEG}/${s.id}.txt`, s.cap);
  const vf = [
    `setpts=PTS/${speed.toFixed(4)}`, "fps=30",
    s.crop ? `crop=${s.crop}` : null,
    "scale=1706:960:flags=lanczos", "pad=1920:1080:107:0:color=0x050608",
    `drawtext=fontfile=${FONT}:textfile=${SEG}/${s.id}.txt:expansion=none:fontcolor=0xFAFAE5:fontsize=34:x=(w-text_w)/2:y=960+(120-text_h)/2`,
    "drawbox=x=0:y=960:w=iw:h=2:color=0xFF4700@0.8:t=fill",
    speed > 1.15 ? `drawtext=fontfile=${MONO}:text='${speed.toFixed(1)}x speed (time-lapse)':expansion=none:fontcolor=0xFAFAE5@0.85:fontsize=20:x=w-text_w-28:y=972` : null,
    marker ? `drawtext=fontfile=${MONO}:text='${esc(marker)}':expansion=none:fontcolor=0xFF4700:fontsize=30:box=1:boxcolor=0x050608@0.85:boxborderw=12:x=107+24:y=24:enable='lt(t,2.5)'` : null,
    "fade=t=in:st=0:d=0.2",
  ].filter(Boolean).join(",");
  ff(["-ss", from.toFixed(3), "-t", len.toFixed(3), "-i", `${RAW}/${s.src}.webm`, "-vf", vf, "-t", dur.toFixed(3), ...enc, out]);
  return dur;
}
const timeline = [], files = [];
let t = 0;
for (const s of plan) {
  let d = 0;
  if (s.card) {
    const out = `${SEG}/${s.id}.mp4`;
    ff(["-loop", "1", "-t", String(s.dur), "-i", `${RAW}/card-${s.card}.png`, "-vf", `fps=30,fade=t=in:st=0:d=0.5,fade=t=out:st=${s.dur - 0.5}:d=0.5`, ...enc, out]);
    files.push(out); d = s.dur;
  } else if (s.parts) {
    s.parts.forEach(([a, b], i) => {
      const out = `${SEG}/${s.id}-${i}.mp4`;
      const skipped = i > 0 ? Math.round(a - s.parts[i - 1][1]) : 0;
      d += clip(s, a, b, b - a, out, skipped > 0 ? `>> ${skipped} s skipped (testnet latency)` : null);
      files.push(out);
    });
  } else {
    const out = `${SEG}/${s.id}.mp4`;
    d = clip(s, s.from, s.to, s.dur ?? s.to - s.from, out, null);
    files.push(out);
  }
  timeline.push({ id: s.id, start: +t.toFixed(2), end: +(t + d).toFixed(2), caption: s.cap ?? null, ...(s.parts && s.parts.length > 1 ? { skipped_s: +(s.parts[1][0] - s.parts[0][1]).toFixed(1) } : {}) });
  t += d;
}
writeFileSync(`${SEG}/list.txt`, files.map((f) => `file '${f.split("/").pop()}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", `${SEG}/list.txt`, "-c", "copy", "-movflags", "+faststart", "demo/lowsec-demo-silent.mp4"]);
writeFileSync("demo/timeline.json", JSON.stringify({ total: +t.toFixed(2), ambushRun: K, source: m, segments: timeline }, null, 2));
console.log(`demo/lowsec-demo-silent.mp4  ${t.toFixed(1)} s`);
