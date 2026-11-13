# @lowsec/sim

Deterministic, headless simulation of the Lowsec economy. One file holds every rule: [`src/params.ts`](src/params.ts) (numbers) and [`src/pricing.ts`](src/pricing.ts) (formulas, integer math mirrored by the Rust contract; parity vectors in `contracts/lowsec/tests/vectors.json`).

```bash
pnpm sim --weeks 4            # council vs no-council baseline, weekly table
pnpm sim --weeks 4 --daily    # + daily table
pnpm sim --weeks 4 --json out.json --seed 7
pnpm --filter @lowsec/sim test
```

Faucets: NPC buy orders (selling cargo to a town), starter grant. Sinks: NPC sell orders (buying cargo), lane tolls, raid fees. Item sinks: cargo destroyed in Lowsec ambushes (burned), town consumption.
Council rule (public, one line), live v0.4 constants: `faucet_next = clamp(faucet × (1 − 3 × (inflation − target)), ±10%/epoch, [70%, 100%])` (v0.3 was gain 2, [70%, 110%]).

## v0.4 Council tuning (live on testnet since 2026-11-13 22:51 CET)

`COUNCIL_V04` in [`src/params.ts`](src/params.ts): same rule and window, **gain 3** (was 2) and **ceiling 100%** (was 110%), so the Council can only tighten faucets. The testnet contract runs v0.4 since a state-keeping code upgrade + owner-only `set_council_params(3, 10000)` ([tx 4M3eDULy…](https://testnet.nearblocks.io/txns/4M3eDULyukMe1TEAXTeTLXm4rpsoM4zGwaX9vPUnbxj5)); `Params::default` for a fresh init still has v0.3. `pnpm sim --weeks 4` prints every metric for no Council / v0.3 / v0.4 (seed 42, launch population):

| metric (day 2+) | no Council | Council v0.3 (previous) | Council v0.4 (live) |
|---|---|---|---|
| mean \|error\| vs 1% (lower better) | 1.62 pp | 1.40 pp | 1.37 pp |
| worst epoch \|error\| (lower better) | 4.65 pp | 4.22 pp | 4.22 pp |
| epochs in 0–1% band (higher better) | 44% | 26% | 48% |
| \|mean − target\| (lower better) | 0.55 pp | 0.60 pp | 0.51 pp |
| final Gini (lower better) | 0.129 | 0.162 | 0.114 |

Across 8 seeds v0.4 still wins error (1.48 vs 1.57 pp), worst epoch (4.20 vs 4.46) and Gini (0.133 vs 0.138) but is 1 pp lower on band time (40% vs 41%). In the small "live" population (4 seeds × 2 weeks) it wins worst epoch, band and Gini but has higher mean error (1.20 vs 1.13 pp). Grid and caveats are in the `COUNCIL_V04` comment.
