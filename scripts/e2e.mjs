// End-to-end check of the full loop in a headless browser + screenshots for the README.
// Usage: pnpm dev (in another shell), then: node scripts/e2e.mjs [http://localhost:3000]
import { chromium } from "playwright";
const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = "docs/screenshots";
const name = `pilot${Math.floor(Math.random() * 1e6)}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => log("PAGE ERROR", e.message));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const toast = async () => (await page.locator(".toast").first().textContent({ timeout: 60_000 }))?.trim();

await page.goto(URL);
await page.waitForSelector(".map");
await page.waitForTimeout(1500);
await shot("01-login");

log("join as", name);
await page.fill(".login input", name);
await page.click(".login button.primary");
await page.waitForSelector("text=Your hold", { timeout: 90_000 });
log("toast:", await toast());
await shot("02-joined");

log("buy 10 ore in Mina");
await page.click(".toast");
await page.locator("tr", { hasText: "ore" }).locator("button", { hasText: "Buy" }).click();
log("toast:", await toast());
await page.waitForTimeout(3000);

log("haul ore to Forja via Lowsec");
await page.click(".toast").catch(() => {});
const haul = page.locator(".panel", { has: page.locator("h3", { hasText: /^Haul$/ }) });
await haul.locator("select").nth(0).selectOption("ore");
await haul.locator("select").nth(1).selectOption({ label: "Forja" });
await page.locator("button.route", { hasText: "Lowsec" }).click();
await page.waitForTimeout(500);
await page.locator("button.primary", { hasText: "Depart" }).click();
await page.waitForSelector("text=On the road", { timeout: 60_000 });
await page.waitForTimeout(2500);
await shot("03-hauling-lowsec");

log("wait for arrival (auto-arrive)");
await page.waitForSelector(".toast >> text=/Arrived|AMBUSHED/", { timeout: 120_000 });
log("toast:", await toast());
await shot("04-arrived");

await page.click(".toast").catch(() => {});
await page.waitForSelector("text=Market · Forja", { timeout: 60_000 });
const sell = page.locator("tr", { hasText: "ore" }).locator("button", { hasText: "Sell all" });
if (await sell.isEnabled()) {
  await sell.click();
  log("toast:", await toast());
  await page.waitForTimeout(2500);
}

log("post a raid");
await page.click(".toast").catch(() => {});
await page.locator(".panel", { hasText: "Raid a Lowsec lane" }).locator("select").selectOption({ label: "mina-puerto" });
await page.locator("button", { hasText: "Post raid" }).click();
log("toast:", await toast());
await page.waitForTimeout(3000);
await shot("05-raid-posted");

log("hover an NPC hauler");
await page.click(".toast").catch(() => {});
const npc = page.locator("g.mover", { hasText: "Kestrel" }).first();
await npc.hover({ force: true });
await page.waitForSelector(".tooltip", { timeout: 10_000 });
await page.locator(".map-wrap").screenshot({ path: `${OUT}/06-npc-tooltip.png` });

log("economic report");
await page.click("button.tab >> text=Economic Report");
await page.waitForSelector("text=Faucets", { timeout: 30_000 });
await page.waitForTimeout(1500);
await shot("07-economic-report");

log("fast-forward");
await page.click("button.tab >> text=Fast-forward");
await page.click("text=Simulate 4 weeks");
await page.waitForSelector("text=mean daily inflation", { timeout: 60_000 });
await shot("08-fast-forward");

await browser.close();
log("done; account", `${name}.lowsec.testnet`);
