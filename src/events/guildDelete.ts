import { Guild } from 'discord.js';
import { CasinoBot } from '../index';
import { sendAdminAlert } from '../utils/adminAlerts';

/** Tell the owner when a server removes the bot - churn is the number to watch. */
export default {
  name: 'guildDelete',
  async execute(guild: Guild) {
    if (!guild.available) return; // Outage, not a removal.
    const client = guild.client as CasinoBot;
    const settings = await client.db.getGuildSettings(guild.id).catch(() => null);
    const days = settings?.joined_at ? Math.floor((Date.now() - settings.joined_at) / 86_400_000) : null;
    void client.db.syncGuildInfo(
      { id: guild.id, name: guild.name ?? null, icon: guild.icon ?? null, memberCount: guild.memberCount ?? null },
      { left: true },
    );
    void sendAdminAlert(client, {
      userId: guild.id,
      kind: 'guild_leave',
      title: '🔴 Serwer usunął bota',
      description:
        `**${guild.name ?? '?'}** (\`${guild.id}\`)\nCzłonkowie: **${guild.memberCount ?? '?'}**` +
        (days != null ? `\nByliśmy tam: **${days} dni**` : '') +
        `\nSerwerów łącznie: **${client.guilds.cache.size}**`,
    });
  },
};
