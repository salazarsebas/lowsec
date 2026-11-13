/** Stale-while-revalidate cache: serve the last payload while a refresh runs. */
export function staleWhileRevalidate<T>(ttlMs: number) {
  let at = 0;
  let payload: T | null = null;
  let inflight: Promise<T> | null = null;
  return async (load: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    if (payload && now - at < ttlMs) return payload;
    if (!inflight) {
      inflight = load()
        .then((v) => {
          payload = v;
          at = Date.now();
          return v;
        })
        .finally(() => {
          inflight = null;
        });
    }
    if (payload) return payload;
    return inflight;
  };
}
