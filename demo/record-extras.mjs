// Title cards (PNG) + the external-agent clip (code + the REAL console output of a testnet run,
// saved in demo/assets/agent-run.log by `node examples/external-agent.mjs lowsec-agent-demo.testnet`).
// Usage (repo root): node demo/record-extras.mjs
import { chromium } from "playwright";
import { readFileSync, readdirSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const RAW = "demo/raw";
mkdirSync(`${RAW}/tmp2`, { recursive: true });
const b = await chromium.launch();
const card = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
for (const k of ["title", "close"]) {
  await card.goto(`file://${resolve("demo/assets/card.html")}?k=${k}${process.env.TEE === "1" ? "&tee=1" : ""}`);
  await card.evaluate(() => document.fonts.ready);
  await card.waitForTimeout(300);
  await card.screenshot({ path: `${RAW}/card-${k}.png` });
}
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: `${RAW}/tmp2`, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto(`file://${resolve("demo/assets/agent.html")}`);
const code = readFileSync("examples/external-agent.mjs", "utf8").trimEnd();
const lines = readFileSync("demo/assets/agent-run.log", "utf8").trim().split("\n");
await p.evaluate(([c, l]) => window.show(c, l, 1300), [code, lines]);
await p.waitForTimeout(900 + lines.length * 1300 + 2500);
await p.close();
await ctx.close();
renameSync(`${RAW}/tmp2/${readdirSync(`${RAW}/tmp2`).find((f) => f.endsWith(".webm"))}`, `${RAW}/agent.webm`);
rmSync(`${RAW}/tmp2`, { recursive: true, force: true });
await b.close();
console.log("cards + agent clip done");
