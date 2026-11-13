/** Generates test vectors that the Rust contract must reproduce exactly (parity test). */
import { writeFileSync } from "node:fs";
import { DEFAULT_PARAMS as P, GOODS } from "./params";
import { askPrice, bidPrice, buyCost, sellPayout, ambushChanceBps, ambushSplit, raidFee, revertStock, goalStock, dockFee } from "./pricing";
import { councilSignalBps, councilStep, inflationBps } from "./council";

export function makeVectors() {
  const stocks = [0, 1, 7, 50, 100, 199, 200, 201, 400, 799, 1600];
  const price = [] as unknown[];
  for (const g of GOODS)
    for (const s of stocks)
      for (const f of [7_000, 9_137, 10_000, 11_000]) {
        price.push({ good: g, stock: s, faucet: f, ask: askPrice(P, g, s), bid: bidPrice(P, g, s, f), buy10: buyCost(P, g, Math.max(s, 10), 10), sell10: sellPayout(P, g, s, 10, f) });
      }
  const ambush = [0, 1, 2, 3, 5, 9].map((r) => ({ raids: r, bps: ambushChanceBps(P, "lowsec", r) }));
  const split = [1, 2, 9, 10, 25, 33].flatMap((q) => [true, false].map((h) => ({ qty: q, raider: h, ...ambushSplit(P, q, h) })));
  const fees = [100, 150, 999, 12345].map((s) => ({ stake: s, fee: raidFee(P, s) }));
  const revert = [1, 50, 100, 101, 400, 799, 800, 1600].flatMap((s) => [true, false].map((h) => ({ stock: s, home: h, next: revertStock(P, s, goalStock(P, h)) })));
  const council = [
    [10_000, 100_000, 103_000],
    [10_000, 100_000, 100_500],
    [10_000, 100_000, 99_000],
    [7_000, 50_000, 60_000],
    [10_900, 80_000, 80_100],
    [8_500, 120_000, 121_300],
  ].map(([f, a, b], i) => ({ faucet: f, supplyStart: a, supplyEnd: b, inflationBps: inflationBps(a, b), next: councilStep(P, i, f, inflationBps(a, b)).nextFaucetBps }));
  const dock = [0, 100, 400, 401, 999, 1000, 5000, 123456].map((g) => ({ gold: g, fee: dockFee(P, g) }));
  const windows = [
    [[100_000, 103_000]],
    [[100_000, 103_000], [103_000, 101_000], [101_000, 104_000]],
    [[5_000, 40_000], [40_000, 40_100], [40_100, 40_200]],
    [[50_000, 49_000], [49_000, 48_500]],
  ].map((w) => ({ window: w, signal: councilSignalBps(w.map(([a, b]) => ({ supplyStart: a, supplyEnd: b })), P.councilWindowEpochs) }));
  return { params: P, price, ambush, split, fees, revert, council, dock, windows };
}

if (process.argv[1]?.endsWith("vectors.ts")) {
  const out = process.argv[2] ?? "../../contracts/lowsec/tests/vectors.json";
  writeFileSync(out, JSON.stringify(makeVectors(), null, 1));
  console.log(`wrote ${out}`);
}
