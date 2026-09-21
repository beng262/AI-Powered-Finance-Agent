/**
 * Key-value cache used by the data sources.
 *
 * Every source treats this as best-effort: if a read or write throws, the request
 * still succeeds, it just goes to the network. The default backend is in-memory,
 * which is why this library needs no database and no configuration.
 *
 * To share the cache across processes (Redis, SQLite, Postgres, a file), call
 * `setCacheBackend` with your own implementation. The shape intentionally matches
 * a Prisma model so the source modules read naturally.
 */

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** Default backend. Process-local, cleared on restart, bounded to avoid unbounded growth. */
class MemoryBackend implements CacheBackend {
  private store = new Map<string, string>();
  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (hit === undefined) return null;
    // refresh recency
    this.store.delete(key);
    this.store.set(key, hit);
    return hit;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, value);
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

let backend: CacheBackend = new MemoryBackend();

/** Swap the cache for a shared or persistent one. */
export function setCacheBackend(next: CacheBackend): void {
  backend = next;
}

export const db = {
  setting: {
    async findUnique(args: { where: { key: string } }): Promise<{ key: string; value: string } | null> {
      const value = await backend.get(args.where.key);
      return value === null ? null : { key: args.where.key, value };
    },

    async upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<{ key: string; value: string }> {
      const value = args.update.value ?? args.create.value;
      await backend.set(args.where.key, value);
      return { key: args.where.key, value };
    },
  },
};
