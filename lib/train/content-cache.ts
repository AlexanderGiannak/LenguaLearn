// Where the live training content is cached (lib/train/content.ts), in a module of its own
// so code that changes what learners may meet (reports pausing a sense) can drop the cache
// without importing the loader, which imports it back.

export type CacheHolder<T> = { trainingContent?: { at: number; value: T } };

export function contentCache<T>(): CacheHolder<T> {
  return globalThis as unknown as CacheHolder<T>;
}

/** Drops the cache: the next request loads the content again. */
export function clearTrainingContentCache() {
  delete contentCache().trainingContent;
}
