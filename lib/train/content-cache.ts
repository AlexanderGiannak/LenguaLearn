// Where the live training content is cached (lib/train/content.ts), in a module of its own
// so code that changes what learners may meet (reports pausing a sense) can drop the cache
// without importing the loader, which imports it back.

type CacheHolder = {
  trainingContent?: { at: number; value: unknown };
  /** Goes up on every clear. A load that started before a clear doesn't fill the cache. */
  trainingContentGeneration?: number;
};

const holder = globalThis as unknown as CacheHolder;

/** The cached value if younger than `ttlMs`, else a fresh `load()` (cached if no clear came first). */
export async function cachedTrainingContent<T>(load: () => Promise<T>, ttlMs: number): Promise<T> {
  const hit = holder.trainingContent;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const generation = holder.trainingContentGeneration ?? 0;
  const value = await load();
  // Cleared while loading (a report paused a sense, a reviewer closed reports): this copy
  // may predate that change, so it serves this request only.
  if ((holder.trainingContentGeneration ?? 0) === generation) {
    holder.trainingContent = { at: Date.now(), value };
  }
  return value;
}

/** Drops the cache: the next request loads the content again. */
export function clearTrainingContentCache() {
  delete holder.trainingContent;
  holder.trainingContentGeneration = (holder.trainingContentGeneration ?? 0) + 1;
}
