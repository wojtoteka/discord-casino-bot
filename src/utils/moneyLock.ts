import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-user async mutex.
 *
 * Locks for two players are taken in sorted userId order (see withUserLocks)
 * so a duel cannot deadlock. The same async chain may re-enter a lock it
 * already holds (play_again → db write).
 */

const heldLocks = new AsyncLocalStorage<Set<string>>();
const tails = new Map<string, Promise<void>>();

export async function withUserLock<T>(userId: string, fn: () => Promise<T> | T): Promise<T> {
  const held = heldLocks.getStore();
  if (held?.has(userId)) {
    return await fn();
  }

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const prev = tails.get(userId) ?? Promise.resolve();
  const next = prev.then(() => gate, () => gate);
  tails.set(userId, next);

  await prev.catch(() => undefined);
  try {
    const nextHeld = new Set(held);
    nextHeld.add(userId);
    return await heldLocks.run(nextHeld, () => Promise.resolve().then(fn));
  } finally {
    release();
    if (tails.get(userId) === next) {
      tails.delete(userId);
    }
  }
}

/** Acquire several user locks in sorted id order to avoid A↔B deadlocks. */
export async function withUserLocks<T>(userIds: string[], fn: () => Promise<T> | T): Promise<T> {
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  const run = ids.reduceRight<() => Promise<T>>(
    (next, id) => () => withUserLock(id, next),
    () => Promise.resolve().then(fn),
  );
  return run();
}
