# @lowsec/sim

Deterministic, headless simulation of the Lowsec economy. One file holds every rule: [`src/params.ts`](src/params.ts) (numbers) and [`src/pricing.ts`](src/pricing.ts) (formulas, integer math mirrored by the Rust contract; parity vectors in `contracts/lowsec/tests/vectors.json`).

```bash
pnpm sim --weeks 4            # council vs no-council baseline, weekly table
pnpm sim --weeks 4 --daily    # + daily table
pnpm sim --weeks 4 --json out.json --seed 7
pnpm --filter @lowsec/sim test
```

Faucets: NPC buy orders (selling cargo to a town), starter grant. Sinks: NPC sell orders (buying cargo), lane tolls, raid fees. Item sinks: cargo destroyed in Lowsec ambushes (burned), town consumption.
Council rule (public, one line): `faucet_next = clamp(faucet × (1 − gain × (inflation − target)), ±10%/epoch, [70%, 110%])`.
