# Lowsec

A mini EVE Frontier on NEAR: haul cargo between 3 towns; the fast **Lowsec** lane can be raided by players and AI haulers, destroyed cargo is **burned**, and an **AI Economic Council** keeps gold inflation in check with one public rule that the contract bounds to ±10% per epoch. No token. Gold and cargo are NEP-245.

> Work in progress for the NEAR HACKATHON (track: Games With Real Economies; also Agents, Swarms). Built from scratch during the hackathon.

## Status
- [x] `packages/sim` — deterministic economy simulation + `pnpm sim --weeks 4`
- [x] `contracts/lowsec` — Rust contract (near-sdk 5.30.1), deployed to [`lowsec.testnet`](https://testnet.nearblocks.io/address/lowsec.testnet) — see [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md)
- [ ] `apps/server` — relayer (NEP-366), NPC haulers + Council on NEAR AI Cloud (TEE)
- [ ] `apps/web` — Next.js game UI

## Try it
```bash
pnpm i
pnpm sim --weeks 4                          # Council vs no-Council baseline
pnpm --filter @lowsec/sim test              # 14 tests
cd contracts/lowsec && cargo test           # 21 unit tests (incl. TS<->Rust parity) + sandbox integration test
```

## Economy in one screen
| | |
|---|---|
| Faucets | NPC buy orders (sell cargo to a town), starter grant — both scaled by the Council's `faucet_bps` |
| Gold sinks | NPC sell orders (buying cargo), lane tolls, raid fees |
| Item sinks | cargo destroyed in Lowsec ambushes (`mt_burn`), town consumption |
| Council rule | `faucet_next = clamp(faucet × (1 − gain × (inflation − target)), ±10%/epoch, [70%, 110%])` |
| Rules file | [`packages/sim/src/params.ts`](packages/sim/src/params.ts) + [`pricing.ts`](packages/sim/src/pricing.ts), mirrored in [`contracts/lowsec/src/rules.rs`](contracts/lowsec/src/rules.rs) |

## License
MIT
