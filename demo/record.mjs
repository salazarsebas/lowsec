// Records the demo footage with Playwright recordVideo against the PRODUCTION build (no Next.js dev badge).
// Usage (repo root, server + `next start` running): node demo/record.mjs [http://localhost:3000]
// Output: demo/raw/main.webm + demo/raw/marks.json (beat timestamps, seconds from video start).
// Honest ambush: three raider pilots stake real raids on the Mina–Forja Lowsec lane first (each raid adds
// +12% ambush chance on-chain); the pilot then keeps hauling that lane until a real ambush happens.
import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync, readdirSync, rmSync } from "node:fs";
const URL = process.argv[2] ?? "http://localhost:3000";
const RAW = "demo/raw";
const MAX_RUNS = Number(process.env.MAX_RUNS ?? 20);
const rnd = Math.floor(Math.random() * 1e5);
const log = (...a) => console.log(new Date().toLocaleTimeString("en-GB"), ...a);
mkdirSync(`${RAW}/tmp`, { recursive: true });

const browser = await chromium.launch();
// 1920x1080 video; the page is zoomed 4/3 so the 1440-wide layout renders crisp at 1080p
const rec = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: `${RAW}/tmp`, size: { width: 1920, height: 1080 } } });
const ZOOM = 4 / 3;
export const INIT = () => {
  const Z = 4 / 3;
  const add = () => {
    const st = document.createElement("style");
    st.textContent = `html{zoom:${Z}}`;
    document.head.appendChild(st);
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.style.cssText = "position:fixed;z-index:99999;width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 3px rgba(62,230,255,.5);pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:width .1s,height .1s";
    document.documentElement.appendChild(c);
    // clientX is in zoomed CSS px; a fixed element inside the zoomed root is scaled again, so divide back
    addEventListener("mousemove", (e) => { c.style.left = e.clientX * (1 / Z) + "px"; c.style.top = e.clientY * (1 / Z) + "px"; }, true);
    addEventListener("mousedown", () => { c.style.width = c.style.height = "11px"; }, true);
    addEventListener("mouseup", () => { c.style.width = c.style.height = "16px"; }, true);
  };
  if (document.head) add(); else addEventListener("DOMContentLoaded", add);
};
await rec.addInitScript(INIT);
const page = await rec.newPage();
const T0 = Date.now();
const marks = {};
const mark = (k) => { marks[k] = (Date.now() - T0) / 1000; log("mark", k, marks[k].toFixed(1)); };
page.on("pageerror", (e) => log("PAGE ERROR", e.message));

let mouse = { x: 960, y: 540 };
async function moveTo(loc, opts = {}) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box");
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: opts.steps ?? 22 });
  mouse = { x, y };
}
async function click(loc, pause = 250) {
  await moveTo(loc);
  await page.waitForTimeout(pause);
  await page.mouse.down();
  await page.mouse.up();
}
const toast = async (p = page) => (await p.locator(".toast").first().textContent({ timeout: 90_000 }))?.trim();
const dismiss = (p = page) => p.locator(".toast").first().click({ timeout: 1000 }).catch(() => {});
const smoothScroll = (y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y).then(() => page.waitForTimeout(900));

// --- raiders (not recorded): real raids on mina-forja
const raiders = [];
async function joinRaider(i) {
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await p.goto(URL);
  await p.waitForSelector(".map");
  await p.fill(".login input", `raider${rnd}x${i}`);
  await p.click(".login button.primary");
  await p.waitForSelector("text=Your hold", { timeout: 120_000 });
  await dismiss(p);
  raiders.push(p);
  return p;
}
async function raid(p) {
  await p.locator(".panel", { hasText: "Raid a Lowsec lane" }).locator("select").selectOption({ label: "mina-forja" });
  await p.locator("button", { hasText: "Post raid" }).click();
  const t = await toast(p).catch(() => "?");
  await dismiss(p);
  log("raid:", t);
}
const rs = await Promise.all([0, 1, 2].map(joinRaider));
for (const p of rs) await raid(p);

// --- A. landing + no-wallet login
await page.goto(URL);
await page.waitForSelector(".map");
await page.waitForTimeout(2500);
mark("landing");
await page.waitForTimeout(2500);
mark("login");
const input = page.locator(".login input");
await click(input);
await page.keyboard.type(`pilot${rnd}`, { delay: 110 });
await page.waitForTimeout(500);
await click(page.locator(".login button.primary"));
await page.waitForSelector("text=Your hold", { timeout: 120_000 });
mark("joined");
await page.waitForTimeout(2500);
await dismiss();

// --- B/C. haul choice + ambush loop
const haulPanel = () => page.locator(".panel", { has: page.locator("h3", { hasText: /^Haul$/ }) });
let ambushed = false;
for (let run = 1; run <= MAX_RUNS && !ambushed; run++) {
  mark(`run${run}`);
  const inMina = (await page.locator("h3", { hasText: "Market · Mina" }).count()) > 0;
  const good = inMina ? "ore" : "parts";
  const to = inMina ? "Forja" : "Mina";
  await page.locator("input[type=range]").first().fill("20").catch(() => {});
  await click(page.locator("tr", { hasText: good }).locator("button", { hasText: "Buy" }));
  log(`run ${run}: buy`, await toast());
  await dismiss();
  await page.waitForTimeout(1500);
  await haulPanel().locator("select").nth(0).selectOption(good);
  await haulPanel().locator("select").nth(1).selectOption({ label: to });
  await moveTo(page.locator("button.route", { hasText: "Safe" }));
  await page.waitForTimeout(1300);
  await click(page.locator("button.route", { hasText: "Lowsec" }));
  await page.waitForTimeout(1300);
  await click(page.locator("button.primary", { hasText: "Depart" }));
  await page.waitForSelector("text=On the road", { timeout: 60_000 });
  mark(`depart${run}`);
  await smoothScroll(0);
  const r = await Promise.race([
    page.waitForSelector(".ambush-banner", { timeout: 120_000 }).then(() => "ambush"),
    page.waitForSelector(".toast >> text=/Arrived/", { timeout: 120_000 }).then(() => "arrived"),
  ]);
  if (r === "ambush") {
    ambushed = true;
    mark("ambush");
    log(`run ${run}: AMBUSHED —`, await toast());
    await page.waitForTimeout(6000);
    mark("ambush_end");
  } else log(`run ${run}:`, await toast());
  await dismiss();
  await page.waitForSelector("h3:has-text('Market ·')", { timeout: 60_000 });
  const sell = page.locator("tr", { hasText: good }).locator("button", { hasText: "Sell all" });
  if (await sell.isEnabled()) {
    await click(sell);
    log(`run ${run}: sell`, await toast());
    await dismiss();
    await page.waitForTimeout(1500);
  }
  if (!ambushed && run % 3 === 0) for (const p of raiders) await raid(p).catch(() => {});
}
if (!ambushed) log(`NO AMBUSH in ${MAX_RUNS} runs — retake needed`);

// --- D. AI trader tooltip
await smoothScroll(0);
const who = process.env.NPC ?? "Vex";
mark("tooltip");
{
  // follow the moving convoy so the tooltip stays open (~10 s)
  const t1 = Date.now();
  while (Date.now() - t1 < 12_500) {
    const bb = await page.locator("g.mover", { hasText: who }).first().boundingBox();
    if (bb) await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
    await page.waitForTimeout(250);
  }
}
mark("tooltip_end");
await page.mouse.move(1900, 200, { steps: 15 });

// --- G. Intents quote (on the play tab)
const dep = page.locator(".deposit");
await dep.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
mark("intents");
await click(dep.locator("button", { hasText: "Get quote" }));
await page.waitForSelector(".deposit .small b, .deposit .red", { timeout: 30_000 }).catch(() => log("quote: no result"));
await page.waitForTimeout(5000);
mark("intents_end");

// --- E. Economic Report + Council
await smoothScroll(0);
await click(page.locator("button.tab", { hasText: "Economic Report" }));
await page.waitForSelector("text=Faucets", { timeout: 30_000 });
mark("report");
await page.waitForTimeout(5000);
for (const y of [450, 900, 1350, 1800]) { await smoothScroll(y); await page.waitForTimeout(2600); }
mark("report_end");

// --- F. Fast-forward 4 weeks
await smoothScroll(0);
await click(page.locator("button.tab", { hasText: "Fast-forward" }));
await page.waitForTimeout(800);
mark("ff");
await click(page.locator("text=Simulate 4 weeks"));
await page.waitForSelector("text=mean daily inflation", { timeout: 60_000 });
await page.waitForTimeout(4500);
await smoothScroll(600);
await page.waitForTimeout(5000);
mark("ff_end");

await page.close();
await rec.close();
const vid = readdirSync(`${RAW}/tmp`).find((f) => f.endsWith(".webm"));
renameSync(`${RAW}/tmp/${vid}`, `${RAW}/main.webm`);
rmSync(`${RAW}/tmp`, { recursive: true, force: true });
writeFileSync(`${RAW}/marks.json`, JSON.stringify({ ...marks, pilot: `pilot${rnd}.lowsec.testnet`, raiders: [0, 1, 2].map((i) => `raider${rnd}x${i}.lowsec.testnet`), ambushed, recordedAt: new Date().toISOString() }, null, 2));
await browser.close();
log("done", ambushed ? "AMBUSH captured" : "no ambush");
