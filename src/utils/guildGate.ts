import type { Database, GuildSettings } from '../database/Database';

/** Slash commands that still work outside the configured casino channel. */
export const CASINO_CHANNEL_EXEMPT = new Set([
  'ustawienia-serwera',
  'ustawienia',
  'zgłoszenie',
  'pomoc',
]);

export async function readGuildSettings(
  db: Database,
  guildId: string | null | undefined,
): Promise<GuildSettings | null> {
  if (!guildId) return null;
  try {
    return await db.getGuildSettings(guildId);
  } catch (error) {
    console.error('[ROYALCASINO] Błąd odczytu ustawień serwera:', error);
    return null;
  }
}

/** Channel ID to use, or null when the command may run here. */
export function restrictedCasinoChannelId(
  commandName: string,
  settings: GuildSettings | null,
  channelId: string | null | undefined,
): string | null {
  const required = settings?.casino_channel_id;
  if (!required || !channelId) return null;
  if (CASINO_CHANNEL_EXEMPT.has(commandName)) return null;
  return channelId !== required ? required : null;
}
