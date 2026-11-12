import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS as P, askPrice, bidPrice, ambushSplit, ambushChanceBps, councilStep, withinBound, gini, runSim, inflationBps, revertStock, goalStock } from "../src/index.js";

describe("pricing", () => {
  it("price is base at target stock, higher when scarce, clamped", () => {
    expect(askPrice(P, "ore", P.targetStock)).toBe(P.basePrice.ore);
    expect(askPrice(P, "ore", P.targetStock / 2)).toBe(P.basePrice.ore * 2);
    expect(askPrice(P, "ore", 0)).toBe((P.basePrice.ore * P.maxPriceBps) / 10_000);
    expect(askPrice(P, "ore", 1e9)).toBe(Math.max(Math.floor((P.basePrice.ore * P.minPriceBps) / 10_000), 1));
  });
  it("NPC bid is below ask at the council's max faucet (no same-town money printer)", () => {
    for (const s of [1, 50, 200, 400, 1600]) expect(bidPrice(P, "parts", s, P.councilMaxFaucetBps)).toBeLessThan(askPrice(P, "parts", s));
  });
  it("stocks revert toward their goal", () => {
    expect(revertStock(P, 100, goalStock(P, true))).toBeGreaterThan(100);
    expect(revertStock(P, 1000, goalStock(P, false))).toBeLessThan(1000);
    expect(revertStock(P, goalStock(P, true), goalStock(P, true))).toBe(goalStock(P, true));
  });
});

describe("lowsec risk", () => {
  it("safe lane never ambushed; raids raise risk up to the cap", () => {
    expect(ambushChanceBps(P, "safe", 10)).toBe(0);
    expect(ambushChanceBps(P, "lowsec", 0)).toBe(P.ambushBaseBps);
    expect(ambushChanceBps(P, "lowsec", 1)).toBe(P.ambushBaseBps + P.ambushPerRaidBps);
    expect(ambushChanceBps(P, "lowsec", 100)).toBe(P.ambushMaxBps);
  });
  it("ambush conserves cargo: burned + looted + kept = qty", () => {
    for (const q of [1, 3, 10, 25])
      for (const h of [true, false]) {
        const s = ambushSplit(P, q, h);
        expect(s.burned + s.looted + s.kept).toBe(q);
        if (!h) expect(s.looted).toBe(0);
      }
    expect(ambushSplit(P, 20, true)).toEqual({ burned: 6, looted: 4, kept: 10 });
  });
});

describe("council", () => {
  it("cuts faucets when inflation is above target and raises them when below", () => {
    expect(councilStep(P, 1, 10_000, 300).nextFaucetBps).toBeLessThan(10_000);
    expect(councilStep(P, 1, 8_000, -200).nextFaucetBps).toBeGreaterThan(8_000);
    expect(councilStep(P, 1, 10_000, 100).nextFaucetBps).toBe(10_000);
  });
  it("never moves more than ±10% per epoch and stays in [min,max]", () => {
    for (const infl of [-50_000, -500, 0, 99, 101, 500, 50_000])
      for (const f of [7_000, 8_000, 10_000, 11_000]) {
        const d = councilStep(P, 1, f, infl);
        expect(withinBound(f, d.nextFaucetBps, P.councilMaxStepBps)).toBe(true);
        expect(d.nextFaucetBps).toBeGreaterThanOrEqual(P.councilMinFaucetBps);
        expect(d.nextFaucetBps).toBeLessThanOrEqual(P.councilMaxFaucetBps);
      }
  });
  it("inflation in bps", () => expect(inflationBps(1000, 1010)).toBe(100));
});

describe("metrics", () => {
  it("gini 0 for equal, near 1 for concentrated", () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0);
    expect(gini([0, 0, 0, 100])).toBeCloseTo(0.75);
  });
});

describe("simulation", () => {
  it("is deterministic for a seed", () => {
    const a = runSim({ weeks: 1, seed: 7, council: true });
    const b = runSim({ weeks: 1, seed: 7, council: true });
    expect(JSON.stringify(a.weekly)).toBe(JSON.stringify(b.weekly));
  });
  it("books balance: supply change == minted - burned", () => {
    const r = runSim({ weeks: 2, seed: 3, council: true });
    for (const w of r.weekly) {
      const minted = w.minted.npc_buy_orders + w.minted.new_player_grant;
      const burned = w.burned.npc_sell_orders + w.burned.tolls + w.burned.raid_fees;
      expect(w.supplyEnd - w.supplyStart).toBe(minted - burned);
    }
  });
  it("destroyed cargo is burned and lowsec gets raided", () => {
    const r = runSim({ weeks: 2, seed: 42, council: true });
    expect(r.weekly.reduce((a, w) => a + w.ambushes, 0)).toBeGreaterThan(0);
    expect(r.weekly.reduce((a, w) => a + w.cargoBurnedUnits, 0)).toBeGreaterThan(0);
  });
  it("the Council brings inflation closer to target than the no-council baseline", () => {
    const err = (council: boolean) => {
      const r = runSim({ weeks: 4, seed: 42, council });
      const d = r.daily.slice(1);
      return d.reduce((a, m) => a + Math.abs(m.inflationBps - P.councilTargetInflationBps), 0) / d.length;
    };
    expect(err(true)).toBeLessThan(err(false));
  });
  it("Council is robust across seeds (wins on most)", () => {
    let wins = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = (c: boolean) => {
        const d = runSim({ weeks: 3, seed, council: c }).daily.slice(1);
        return d.reduce((a, m) => a + Math.abs(m.inflationBps - P.councilTargetInflationBps), 0);
      };
      if (e(true) < e(false)) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(4);
  });
});
