/**
 * Shared helpers for handling Discord interaction edge cases.
 */

/**
 * 10062 = Unknown Interaction (token expired before we answered),
 * InteractionAlreadyReplied = we already answered this interaction.
 * Both are normal race conditions, not real failures.
 */
export function isUnknownInteractionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: number | string }).code;
  return code === 10062 || code === 'InteractionAlreadyReplied';
}
