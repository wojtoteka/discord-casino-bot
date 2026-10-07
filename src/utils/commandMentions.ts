import { Client } from 'discord.js';
import { guildIdForBot } from './slashDeploy';

/**
 * Slash command ids, so text can use `</blackjack:123>` mentions - Discord
 * renders those as clickable chips that open the command. Ids change only on
 * redeploy, so one fetch after login is enough.
 */
const ids = new Map<string, string>();

export async function refreshCommandIds(client: Client): Promise<void> {
  try {
    const guild = guildIdForBot('casino');
    const commands = guild
      ? await client.application?.commands.fetch({ guildId: guild.value })
      : await client.application?.commands.fetch();
    if (!commands) return;
    ids.clear();
    for (const command of commands.values()) ids.set(command.name, command.id);
  } catch (error) {
    console.error('[ROYALCASINO] Nie udało się pobrać ID komend:', error);
  }
}

/** Clickable mention when the id is known, plain `/name` otherwise. */
export function cmd(name: string, sub?: string): string {
  const id = ids.get(name);
  const full = sub ? `${name} ${sub}` : name;
  return id ? `</${full}:${id}>` : `/${full}`;
}
