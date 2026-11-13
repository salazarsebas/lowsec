/** Map a NEAR / contract error into a short plain-English API message. */
export function friendlyError(err: string | undefined | null): string | undefined {
  if (!err) return undefined;
  const raw = String(err);
  const patterns = [
    /Smart contract panicked:\s*([^\n"]+)/i,
    /ExecutionError"\s*:\s*"Smart contract panicked:\s*([^"]+)/i,
    /ExecutionError"\s*:\s*"([^"]+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m?.[1]) return tidy(m[1]);
  }
  // JSON-RPC / relayer wrappers that already are short
  if (raw.length <= 160 && !raw.trim().startsWith("{")) return tidy(raw);
  const short = tidy(raw.replace(/\s+/g, " "));
  return short.length > 180 ? short.slice(0, 177) + "…" : short;
}

function tidy(s: string): string {
  return s.replace(/\\n/g, " ").replace(/\s+/g, " ").replace(/[.,;]+$/, "").trim();
}
