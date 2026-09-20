/**
 * Minimal TTL cache for live provider responses.
 *
 * `docker-compose.yml` provisions Redis but nothing in the codebase used it —
 * this in-memory Map is the practical default that works with zero extra
 * infrastructure. If multiple API instances need to share one cache (or the
 * process restarts too often for in-memory to help), swap the two functions
 * below for `redis.get`/`redis.set` against REDIS_URL; every call site here
 * stays the same either way.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheStats() {
  const now = Date.now();
  let active = 0;
  for (const entry of store.values()) if (entry.expiresAt > now) active++;
  return { entries: store.size, active, now: new Date(now).toISOString() };
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Fetch-or-compute with caching in one call — the common shape every call site needs. */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cacheSet(key, value, ttlMs);
  return value;
}
