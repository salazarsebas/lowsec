// Writes demo/VOICEOVER.md (English, what Sebastián reads) and demo/VOICEOVER.es.md (Spanish reference)
// with timestamps taken from demo/timeline.json, so the script always matches the current cut.
// Usage (repo root, after assemble.mjs): node demo/make-voiceover.mjs
import { readFileSync, writeFileSync } from "node:fs";
const tl = JSON.parse(readFileSync("demo/timeline.json", "utf8"));
const tee = process.env.TEE === "1";
const EN = {
  hook: "This cargo just burned. On-chain. Gone for good.",
  title: "This is Lowsec: a space-trading economy on NEAR where players and AI traders share one market.",
  login: "No wallet. No seed phrase. Type a name, and you get a real NEAR account. Every move after that is gasless.",
  haul: "Buy ore where it's cheap, sell where it's scarce. The safe lane is slow but safe. Lowsec is three times faster, but raiders camp it.",
  ambush: "Lowsec it is. Ten seconds out, and there it is: convoy intercepted. Part of the cargo is burned, part goes to the raider who camped this lane. That burn is a real sink, and the burned counter never goes down.",
  tooltip: tee
    ? "You compete with four AI traders. Each picks its strategy with a NEAR AI model running in a TEE, and the attestation goes on-chain. Moves in between are cheap rules."
    : "You compete with four AI traders. Each picks its strategy with a NEAR AI model, and the decision hash goes on-chain. Here it runs in clearly labelled mock mode.",
  report: "Every faucet and sink is public. The Economic Report reads the ledger straight from the contract. An AI Council follows one public rule: too much growth, cut rewards; too little, raise them. The contract caps each step at ten percent.",
  ff: "Fast-forward four weeks with the same rules as the contract: inflation stays close to the one percent target.",
  agent: "Want to compete? Bring your own agent. Twenty-one lines of JavaScript, its own NEAR account, and it's trading.",
  intents: "And with NEAR Intents, you can get a cross-chain deposit quote in one click.",
  close: "Lowsec: a real economy, verifiable AI, on NEAR. Open source on GitHub: salazarsebas slash lowsec.",
};
const ES = {
  hook: "Esta carga acaba de arder. On-chain. Perdida para siempre.",
  title: "Esto es Lowsec: una pequeña economía de comercio espacial en NEAR, donde jugadores y traders de IA comparten un mercado.",
  login: "Sin wallet. Sin frase semilla. Escribes un nombre y tienes una cuenta NEAR real. Cada jugada después no paga gas.",
  haul: "Compra mineral donde es barato y véndelo donde escasea. La ruta segura es lenta pero sin riesgo. Lowsec es tres veces más rápida, pero hay piratas acechando.",
  ambush: "Vamos por Lowsec. Diez segundos de viaje y ahí está: convoy interceptado. Parte de la carga se quema y parte se la lleva el pirata que acechaba esta ruta. Esa quema es un sumidero real, y el contador de carga quemada nunca baja.",
  tooltip: tee
    ? "Compites con cuatro traders de IA. Cada uno elige su estrategia con un modelo de NEAR AI en un TEE, y la atestación queda on-chain. Las jugadas intermedias son reglas baratas."
    : "Compites con cuatro traders de IA. Cada uno elige su estrategia con un modelo de NEAR AI, y el hash de la decisión queda on-chain. Aquí corre en modo mock, claramente etiquetado.",
  report: "Cada fuente y sumidero de oro es público. El Informe Económico lee el libro contable directo del contrato. Un Consejo de IA sigue una regla pública: si crece demasiado, recorta recompensas; si crece poco, las sube. El contrato limita cada paso al diez por ciento.",
  ff: "Adelantamos cuatro semanas con las mismas reglas del contrato: la inflación se queda cerca del objetivo del uno por ciento.",
  agent: "¿Quieres competir? Trae tu propio agente. Veintiuna líneas de JavaScript, su propia cuenta NEAR, y ya está comerciando.",
  intents: "Y con NEAR Intents obtienes una cotización de depósito cross-chain con un clic.",
  close: "Lowsec: una economía real, IA verificable, en NEAR. Código abierto en GitHub: salazarsebas barra lowsec.",
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.round((s % 1) * 10)).padStart(1, "0")}`;
const words = (t) => t.split(/\s+/).length;
function doc(lang, L) {
  const head = lang === "en"
    ? `# Lowsec demo — voiceover script (English)\n\nVideo: \`demo/lowsec-demo-silent.mp4\` (${tl.total.toFixed(1)} s, 1920×1080, no audio). Read each line inside its window; pace ≈ 2.5 words/s. The on-screen captions already carry the facts, so small timing drift is fine.\n\nRecord as one take (WAV/M4A/MP3, any rate), then run \`demo/mux.sh your-audio.ext\` — it normalises loudness to −16 LUFS and muxes it.\n\n| # | window | on screen | line to read | words / s |\n|---|---|---|---|---|\n`
    : `# Lowsec demo — guion de locución (copia en español, solo referencia)\n\nEl vídeo se narra en INGLÉS (ver \`VOICEOVER.md\`). Esta es la traducción de cada línea con las mismas ventanas de tiempo.\n\n| # | ventana | en pantalla | texto | palabras / s |\n|---|---|---|---|---|\n`;
  const rows = tl.segments.map((s, i) => `| ${i + 1} | ${fmt(s.start)}–${fmt(s.end)} | ${s.caption ?? (s.id === "title" ? "title card" : "closing card: tracks + github.com/salazarsebas/lowsec")} | ${L[s.id]} | ${words(L[s.id])} / ${(s.end - s.start).toFixed(1)} |`);
  return head + rows.join("\n") + "\n";
}
writeFileSync("demo/VOICEOVER.md", doc("en", EN));
writeFileSync("demo/VOICEOVER.es.md", doc("es", ES));
for (const s of tl.segments) { const r = words(EN[s.id]) / (s.end - s.start); if (r > 2.9) console.log(`! ${s.id}: ${r.toFixed(2)} words/s (tight)`); }
console.log("wrote demo/VOICEOVER.md + demo/VOICEOVER.es.md");
