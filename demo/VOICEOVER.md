# Lowsec demo — voiceover script (English)

Video: `demo/lowsec-demo-silent.mp4` (118.0 s, 1920×1080, no audio). Read each line inside its window; pace ≈ 2.5 words/s. The on-screen captions already carry the facts, so small timing drift is fine.

Record as one take (WAV/M4A/MP3, any rate), then run `demo/mux.sh your-audio.ext` — it normalises loudness to −16 LUFS and muxes it.

| # | window | on screen | line to read | words / s |
|---|---|---|---|---|
| 1 | 0:00.0–0:05.0 | A real ambush on NEAR testnet: burned cargo is gone for good | This cargo just burned. On-chain. Gone for good. | 8 / 5.0 |
| 2 | 0:05.0–0:11.0 | title card | This is Lowsec: a space-trading economy on NEAR where players and AI traders share one market. | 16 / 6.0 |
| 3 | 0:11.0–0:21.0 | No wallet, no seed phrase, no gas: type a name and play | No wallet. No seed phrase. Type a name, and you get a real NEAR account. Every move after that is gasless. | 21 / 10.0 |
| 4 | 0:21.0–0:34.0 | Safe lane: slow, no risk. Lowsec: 3x faster, but raiders camp it | Buy ore where it's cheap, sell where it's scarce. The safe lane is slow but safe. Lowsec is three times faster, but raiders camp it. | 25 / 13.0 |
| 5 | 0:34.0–0:49.0 | Ambushed: part of the cargo burns on-chain, part goes to the raider | Lowsec it is. Ten seconds out, and there it is: convoy intercepted. Part of the cargo is burned, part goes to the raider who camped this lane. That burn is a real sink, and the burned counter never goes down. | 40 / 15.0 |
| 6 | 0:49.0–1:01.0 | 4 AI traders: decisions logged on-chain (MOCK fallback until NEAR AI credits are active) | Four AI traders compete with you. They're built for NEAR AI Cloud's private TEE, attestation checked. Until credits activate, a labelled mock decides. Every decision is logged on-chain. | 28 / 12.0 |
| 7 | 1:01.0–1:16.0 | Economic Report from the contract · Council v0.4: one public rule, max 10%/epoch | Every faucet and sink is public. The Economic Report reads the ledger straight from the contract. An AI Council follows one public rule: too much growth, cut rewards; too little, raise them. The contract caps each step at ten percent. | 40 / 15.0 |
| 8 | 1:16.0–1:24.0 | Fast-forward 4 weeks: live Council v0.4 vs v0.3 vs no Council, every metric | Fast-forward four weeks with the live v0.4 Council. Every metric is shown: it beats no Council on error, worst day and inequality. | 22 / 8.0 |
| 9 | 1:24.0–1:35.0 | Real testnet run: an outside agent trading with its own NEAR account | Want to compete? Bring your own agent. Twenty-one lines of JavaScript, its own NEAR account, and it's trading. | 18 / 11.0 |
| 10 | 1:35.0–1:42.0 | NEAR Intents 1Click: live cross-chain deposit quote (quote only) | And with NEAR Intents, you can get a cross-chain deposit quote in one click. | 14 / 7.0 |
| 11 | 1:42.0–1:50.0 | That ambush on a public explorer: cargo burned, loot sent to the raider | Every move is a real testnet transaction: here is that ambush on the explorer, cargo burned. | 16 / 8.0 |
| 12 | 1:50.0–1:58.0 | closing card: tracks + github.com/salazarsebas/lowsec | Lowsec: a real economy on NEAR, with every AI decision logged on-chain. Open source on GitHub: salazarsebas slash lowsec. | 19 / 8.0 |
