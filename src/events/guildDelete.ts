import { Guild } from 'discord.js';
import { CasinoBot } from '../index';

/** Keep the guild record in sync when a server removes the bot (no owner notification). */
export default {
  name: 'guildDelete',
  async execute(guild: Guild) {
    if (!guild.available) return; // Outage, not a removal.
    const client = guild.client as CasinoBot;
    void client.db.syncGuildInfo(
      { id: guild.id, name: guild.name ?? null, icon: guild.icon ?? null, memberCount: guild.memberCount ?? null },
      { left: true },
    );
  },
};
