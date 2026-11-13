/** Contract / relayer errors → one short line a player understands. Never shows raw panic JSON.
 *  (The server may already have cleaned the message; this is safe to apply twice.) */
const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/not enough gold: have (\d+), need (\d+)/i, (m) => `Not enough gold: you have ${m[1]}◎, this needs ${m[2]}◎.`],
  [/not enough (\w+): have (\d+), need (\d+)/i, (m) => (Number(m[2]) === 0 ? `Your hold has no ${m[1]}. Buy some first.` : `You only have ${m[2]} ${m[1]} (needed ${m[3]}). The view was out of date; it is refreshed now.`)],
  [/over cargo cap|qty must be 1\.\.=cargo_cap/i, () => "Hold full: a convoy carries at most 25 units."],
  [/town is out of stock/i, () => "This town is out of stock for that good. Try a smaller amount."],
  [/already travelling|you are travelling/i, () => "Your convoy is already on the road."],
  [/not travelling/i, () => "Your convoy already docked."],
  [/still travelling/i, () => "Still in transit. Arrival settles automatically."],
  [/already there/i, () => "You're already docked there. Pick another destination."],
  [/not registered/i, () => "Your pilot is still being registered. Try again in a few seconds."],
  [/stake below minimum/i, () => "Raid stake is below the minimum."],
  [/you already have an active raid/i, () => "You already have a raid posted."],
  [/too many active raids/i, () => "That lane is full of raiders already."],
  [/qty must be > 0/i, () => "Pick an amount above zero."],
  [/rate.?limit|429|too many requests/i, () => "Testnet RPC is busy. Try again in a moment."],
  [/timeout|timed out/i, () => "Testnet is slow right now. Your action may still land; the view refreshes automatically."],
];

export function friendly(err: unknown): string {
  const raw = String((err as any)?.message ?? err ?? "").trim();
  if (!raw) return "Something went wrong. Try again.";
  for (const [re, f] of RULES) {
    const m = re.exec(raw);
    if (m) return f(m);
  }
  const p = /Smart contract panicked:\s*([^"\n}]+)/i.exec(raw);
  const msg = (p ? p[1] : raw).replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  if (msg.startsWith("{") || msg.length > 140) return "The transaction failed on-chain. Your state was refreshed; try again.";
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

/** Feed lines written by the server for failed txs can carry the raw panic; show the friendly form instead. */
export function feedText(f: { text: string; ok?: boolean }): string {
  if (!/panicked|ExecutionError|FunctionCallError|\{"/.test(f.text)) return f.text;
  const i = f.text.search(/:\s*(Smart contract|\{|Error|ExecutionError)/);
  const head = i > 0 ? f.text.slice(0, i).replace(/\s+failed$/i, "") : "";
  return `${head ? `${head} failed: ` : ""}${friendly(f.text)}`;
}
