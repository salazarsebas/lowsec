# Lowsec demo — voiceover script (English)

Video: `demo/lowsec-demo-silent.mp4` (122.3 s, 1920×1080, no audio). Read each line inside its window; pace ≈ 2.5 words/s. The on-screen captions already carry the facts, so small timing drift is fine.

Record as one take (WAV/M4A/MP3, any rate), then run `demo/mux.sh your-audio.ext` — it normalises loudness to −16 LUFS and muxes it.

| # | window | on screen | line to read | words / s |
|---|---|---|---|---|
| 1 | 0:00.0–0:05.0 | A real ambush on NEAR testnet: burned cargo is gone for good | This cargo just burned. On-chain. Gone for good. | 8 / 5.0 |
| 2 | 0:05.0–0:12.0 | title card | This is Lowsec: a space-trading economy on NEAR where players and AI traders share one market. | 16 / 7.0 |
| 3 | 0:12.0–0:23.0 | No wallet, no seed phrase, no gas: type a name and play | No wallet. No seed phrase. Type a name, and you get a real NEAR account. Every move after that is gasless. | 21 / 11.0 |
| 4 | 0:23.0–0:35.0 | Safe lane: slow, no risk. Lowsec: 3x faster, but raiders camp it | Buy ore where it's cheap, sell where it's scarce. The safe lane is slow but safe. Lowsec is three times faster, but raiders camp it. | 25 / 12.0 |
| 5 | 0:35.0–0:54.3 | Ambushed: part of the cargo burns on-chain, part goes to the raider | Lowsec it is. Ten seconds out, and there it is: convoy intercepted. Part of the cargo is burned, part goes to the raider who camped this lane. That burn is a real sink, and the burned counter never goes down. | 40 / 19.3 |
| 6 | 0:54.3–1:06.3 | 4 AI traders: strategy per epoch, hash on-chain (MOCK fallback: NEAR AI credits pending) | You compete with four AI traders. Each picks its strategy with a NEAR AI model, and the decision hash goes on-chain. Here it runs in clearly labelled mock mode. | 29 / 12.0 |
| 7 | 1:06.3–1:22.3 | Economic Report from the contract · Council: one public rule, max 10%/epoch | Every faucet and sink is public. The Economic Report reads the ledger straight from the contract. An AI Council follows one public rule: too much growth, cut rewards; too little, raise them. The contract caps each step at ten percent. | 40 / 16.0 |
| 8 | 1:22.3–1:34.3 | Fast-forward 4 weeks in the simulator: the same rules as the contract | Fast-forward four weeks with the same rules as the contract: inflation stays close to the one percent target. | 18 / 12.0 |
| 9 | 1:34.3–1:46.3 | Real testnet run: an outside agent trading with its own NEAR account | Want to compete? Bring your own agent. Twenty-one lines of JavaScript, its own NEAR account, and it's trading. | 18 / 12.0 |
| 10 | 1:46.3–1:54.3 | NEAR Intents 1Click: live cross-chain deposit quote (quote only) | And with NEAR Intents, you can get a cross-chain deposit quote in one click. | 14 / 8.0 |
| 11 | 1:54.3–2:02.3 | closing card: tracks + github.com/salazarsebas/lowsec | Lowsec: a real economy, verifiable AI, on NEAR. Open source on GitHub: salazarsebas slash lowsec. | 15 / 8.0 |
