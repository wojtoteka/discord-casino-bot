import { Client } from 'discord.js';

/**
 * Both bots run in the same process (see start-bots.ts). Admin commands that
 * need to act as the player-facing bot (e.g. DMing a user "from" RoyalCasino
 * instead of from the admin bot) grab the client reference through here.
 */
let mainBotClient: Client | null = null;

export function registerMainBotClient(client: Client): void {
  mainBotClient = client;
}

export function getMainBotClient(): Client | null {
  return mainBotClient;
}
