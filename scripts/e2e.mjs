// End-to-end check of the full loop in a headless browser + screenshots for the README.
// Usage: pnpm dev (in another shell), then: node scripts/e2e.mjs [http://localhost:3000]
// Two pilots: a hauler (main) and a raider who camps the hauler's Lowsec lane, so an ambush
// happens within a few runs (the run keeps hauling Mina <-> Forja via Lowsec until it does).
import { chromium } from "playwright";
const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = "docs/screenshots";
const MAX_RUNS = Number(process.env.MAX_RUNS ?? 14);
const rnd = Math.floor(Math.random() * 1e5);
const log = (...a) => console.log(new Date().toLocaleTimeString("en-GB"), ...a);

const browser = await chromium.launch();
const mk = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  p.on("pageerror", (e) => log("PAGE ERROR", e.message));
  return p;
};
const page = await mk();
const shot = (n, p = page) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const toast = async (p = page) => (await p.locator(".toast").first().textContent({ timeout: 90_000 }))?.trim();
const dismiss = (p = page) => p.click(".toast", { timeout: 1000 }).catch(() => {});

async function join(p, name) {
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForSelector(".map");
  await p.fill(".login input", name);
  await p.click(".login button.primary");
  await p.waitForSelector("text=Your hold", { timeout: 120_000 });
  const joined = (await p.locator(".toast").first().textContent({ timeout: 2000 }).catch(() => "Your hold ready"))?.trim();
  log(name, "joined:", joined, `latency=${Date.now() - t0}ms`);
  await dismiss(p);
}
async function postRaid(p, lane) {
  await p.locator(".panel", { hasText: "Raid a Lowsec lane" }).locator("select").selectOption({ label: lane });
  await p.locator("button", { hasText: "Post raid" }).click();
  const t = await toast(p);
  log("raid:", t);
  await dismiss(p);
  return t;
}

// 1. landing
await page.goto(URL);
await page.waitForSelector(".map");
await page.waitForTimeout(1500);
await shot("01-login");

// 2. raider pilot camps mina-forja
const raider = await mk();
await join(raider, `raider${rnd}`);
await postRaid(raider, "mina-forja");
await raider.waitForTimeout(2500);
await shot("05-raid-posted", raider);

// 3. hauler pilot
await join(page, `pilot${rnd}`);
await page.waitForTimeout(1500);
await shot("02-joined-onboarding");

const haulPanel = () => page.locator(".panel", { has: page.locator("h3", { hasText: /^Haul$/ }) });
let ambushed = false;
for (let run = 1; run <= MAX_RUNS && !ambushed; run++) {
  const inMina = (await page.locator("h3", { hasText: "Market · Mina" }).count()) > 0;
  const good = inMina ? "ore" : "parts";
  const to = inMina ? "Forja" : "Mina";
  await page.locator("input[type=range]").first().fill("20").catch(() => {});
  await page.locator("tr", { hasText: good }).locator("button", { hasText: "Buy" }).click();
  log(`run ${run}: buy`, await toast());
  await dismiss();
  await page.waitForTimeout(2500);
  await haulPanel().locator("select").nth(0).selectOption(good);
  await haulPanel().locator("select").nth(1).selectOption({ label: to });
  await page.locator("button.route", { hasText: "Lowsec" }).click();
  const tDep = Date.now();
  await page.locator("button.primary", { hasText: "Depart" }).click();
  await page.waitForSelector("text=On the road", { timeout: 60_000 });
  log(`run ${run}: ${good} → ${to} via Lowsec depart=${Date.now() - tDep}ms`);
  if (run === 1) {
    await page.waitForTimeout(3000);
    await shot("03-hauling-lowsec");
  }
  const tArr = Date.now();
  const r = await Promise.race([
    page.waitForSelector(".ambush-banner", { timeout: 120_000 }).then(() => "ambush"),
    page.waitForSelector(".toast >> text=/Arrived/", { timeout: 120_000 }).then(() => "arrived"),
  ]);
  log(`run ${run}: arrive_or_ambush=${r} latency=${Date.now() - tArr}ms`);
  if (r === "ambush") {
    ambushed = true;
    await page.waitForTimeout(1500); // let the alert's numbers count up (it auto-dismisses at 2.5 s)
    await page.screenshot({ path: `${OUT}/04-ambush.png` });
    await page.waitForTimeout(300);
    await shot("04b-ambush-full");
    log(`run ${run}: AMBUSHED —`, await toast());
  } else log(`run ${run}:`, await toast());
  await dismiss();
  await page.waitForSelector("h3:has-text('Market ·')", { timeout: 60_000 });
  const sell = page.locator("tr", { hasText: good }).locator("button", { hasText: "Sell all" });
  if (await sell.isEnabled()) {
    await sell.click();
    log(`run ${run}: sell`, await toast());
    await dismiss();
    await page.waitForTimeout(2500);
  }
  // keep the raider camping the lane (raids expire after 24 ticks)
  if (!ambushed && run % 3 === 0) await postRaid(raider, "mina-forja").catch(() => {});
}
if (!ambushed) log(`no ambush in ${MAX_RUNS} runs (bad luck); 04-ambush.png not refreshed`);
await page.waitForTimeout(2000);
await shot("10-session-goals");

// 4. NPC tooltip
const npc = page.locator("g.mover", { hasText: "Kestrel" }).first();
await npc.hover({ force: true });
await page.waitForSelector(".tooltip", { timeout: 10_000 });
await page.locator(".map-wrap").screenshot({ path: `${OUT}/06-npc-tooltip.png` });

// 5. deposit quote (NEAR Intents 1Click dry:true)
await page.locator(".deposit button", { hasText: "Get quote" }).click();
await page.waitForSelector(".deposit .small b, .deposit .red", { timeout: 30_000 });
await page.locator(".deposit").screenshot({ path: `${OUT}/09-intents-quote.png` });
log("quote:", (await page.locator(".deposit .small").first().textContent())?.trim());

// 6. economic report
await page.click("button.tab >> text=Economic Report");
await page.waitForSelector("text=Faucets", { timeout: 30_000 });
await page.waitForTimeout(2000);
await shot("07-economic-report");

// 7. fast-forward
await page.click("button.tab >> text=Fast-forward");
await page.click("text=Simulate 4 weeks");
await page.waitForSelector("text=mean daily inflation", { timeout: 60_000 });
await shot("08-fast-forward");

await browser.close();
log("done; accounts", `pilot${rnd}.lowsec.testnet`, `raider${rnd}.lowsec.testnet`, ambushed ? "(ambushed)" : "");
