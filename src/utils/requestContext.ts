import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-interaction context that follows the async call chain, so deep helpers
 * (recordGame, getUserLang) know which server a game was played on without
 * threading a guild id through every command signature.
 */
export interface RequestContext {
  guildId: string | null;
  channelId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentGuildId(): string | null {
  return storage.getStore()?.guildId ?? null;
}
