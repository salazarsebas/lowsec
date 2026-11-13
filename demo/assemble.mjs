// Cuts demo/raw/*.webm by the beat marks, adds title cards + captions and concatenates into
// demo/lowsec-demo-silent.mp4 (1920x1080, 30 fps, H.264, no audio). Also writes demo/timeline.json.
// Usage (repo root): node demo/assemble.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const RAW = "demo/raw", SEG = "demo/raw/seg";
mkdirSync(SEG, { recursive: true });
const m = JSON.parse(readFileSync(`${RAW}/marks.json`, "utf8"));
const runs = Object.keys(m).filter((k) => /^depart\d+$/.test(k)).map((k) => Number(k.slice(6)));
const K = Math.max(...runs.filter((r) => m[`depart${r}`] < m.ambush));
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const plan = [
  { id: "hook", src: "main", from: m.ambush - 0.8, to: m.ambush + 4.2, dur: 5, cap: "A real ambush on NEAR testnet: burned cargo is gone for good" },
  { id: "title", card: "title", dur: 7 },
  { id: "login", src: "main", from: m.login - 0.3, to: m.joined + 1.7, dur: 11, cap: "No wallet, no seed phrase, no gas: type a name and play" },
  { id: "haul", src: "main", from: m[`run${K}`], to: m[`depart${K}`], dur: 12, cap: "Safe lane: slow, no risk. Lowsec: 3x faster, but raiders camp it" },
  { id: "ambush", src: "main", from: m[`depart${K}`], to: m.ambush_end, dur: null, cap: "Ambushed: part of the cargo burns on-chain, part goes to the raider" },
  { id: "tooltip", src: "main", from: m.tooltip, to: m.tooltip_end, dur: 12, cap: process.env.TEE === "1" ? "4 AI traders: NEAR AI strategy in a TEE, attestation hash on-chain" : "4 AI traders: strategy per epoch, hash on-chain (MOCK fallback: NEAR AI credits pending)" },
  { id: "report", src: "main", from: m.report, to: m.report_end, dur: 16, cap: "Economic Report from the contract · Council: one public rule, max 10%/epoch" },
  { id: "ff", src: "main", from: m.ff, to: m.ff_end, dur: 12, cap: "Fast-forward 4 weeks in the simulator: the same rules as the contract" },
  { id: "agent", src: "agent", from: 0.4, to: 12.4, dur: 12, cap: "Real testnet run: an outside agent trading with its own NEAR account" },
  { id: "intents", src: "main", from: m.intents, to: m.intents_end, dur: 8, crop: "640:360:1280:720", cap: "NEAR Intents 1Click: live cross-chain deposit quote (quote only)" },
  { id: "close", card: "close", dur: 8 },
];

const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-an"];
const timeline = [];
let t = 0;
for (const s of plan) {
  const out = `${SEG}/${s.id}.mp4`;
  if (s.card) {
    ff(["-loop", "1", "-t", String(s.dur), "-i", `${RAW}/card-${s.card}.png`, "-vf", `fps=30,fade=t=in:st=0:d=0.5,fade=t=out:st=${s.dur - 0.5}:d=0.5`, ...enc, out]);
  } else {
    const len = s.to - s.from;
    const dur = s.dur ?? len;
    const speed = len / dur;
    writeFileSync(`${SEG}/${s.id}.txt`, s.cap);
    const cap = `drawbox=x=0:y=ih-120:w=iw:h=120:color=black@0.62:t=fill,drawtext=fontfile=${FONT}:textfile=${SEG}/${s.id}.txt:expansion=none:fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-80`;
    ff(["-ss", s.from.toFixed(3), "-t", len.toFixed(3), "-i", `${RAW}/${s.src}.webm`, "-vf", `setpts=PTS/${speed.toFixed(4)},fps=30,${s.crop ? `crop=${s.crop},` : ""}scale=1920:1080:flags=lanczos,${cap},fade=t=in:st=0:d=0.25`, "-t", dur.toFixed(3), ...enc, out]);
    s.dur = dur;
  }
  timeline.push({ id: s.id, start: +t.toFixed(2), end: +(t + s.dur).toFixed(2), caption: s.cap ?? null });
  t += s.dur;
}
writeFileSync(`${SEG}/list.txt`, plan.map((s) => `file '${s.id}.mp4'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", `${SEG}/list.txt`, "-c", "copy", "-movflags", "+faststart", "demo/lowsec-demo-silent.mp4"]);
writeFileSync("demo/timeline.json", JSON.stringify({ total: +t.toFixed(2), ambushRun: K, source: m, segments: timeline }, null, 2));
console.log(`demo/lowsec-demo-silent.mp4  ${t.toFixed(1)} s`);
