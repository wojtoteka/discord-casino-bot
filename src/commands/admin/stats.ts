import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper, GameHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-statystyki')
    .setNameLocalizations(slashNameLocales('admin-stats'))
    .setDescription('[ADMIN] Wyświetl statystyki bota')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Show bot statistics')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);

    try {
      const stats = await db.getHealthStats();
      const guilds = interaction.client.guilds.cache.size;
      const avg = Math.floor(Number(stats.totalMoney) / (stats.users || 1));

      const description =
        `**🎮 Serwery (admin bot):** ${guilds}\n\n` +
        `**👥 Konta:** ${stats.users.toLocaleString('pl-PL')}\n` +
        `**🆕 Nowe konta (24h):** ${stats.newUsers24h.toLocaleString('pl-PL')}\n` +
        `**🔒 Zablokowani:** ${stats.blocked.toLocaleString('pl-PL')}\n` +
        `**✅ Aktywni:** ${(stats.users - stats.blocked).toLocaleString('pl-PL')}\n\n` +
        `**💰 Pieniądze w obiegu:** ${GameHelper.formatMoney(Number(stats.totalMoney) || 0)}\n` +
        `**🎟️ Kredyty w obiegu:** ${GameHelper.formatCredits(Number(stats.totalCredits) || 0)}\n` +
        `**💵 Średnio na konto:** $${avg.toLocaleString('pl-PL')}\n\n` +
        `**🎮 Gry 24h:** ${stats.games24h.toLocaleString('pl-PL')}\n` +
        `**💸 Obstawione 24h:** $${Number(stats.wagered24h).toLocaleString('pl-PL')}\n` +
        `**🏦 Netto kasyna 24h:** $${Number(stats.houseNet24h).toLocaleString('pl-PL')}\n` +
        `**🎮 Gry łącznie:** ${Number(stats.totalGames).toLocaleString('pl-PL')}\n\n` +
        `**🗳️ Głosy 24h:** ${stats.votesLast24h.toLocaleString('pl-PL')}  ·  łącznie ${stats.votesTotal.toLocaleString('pl-PL')}`;

      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed('📊 Statystyki Bota', description)],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd pobierania statystyk:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas pobierania statystyk.')],
        flags: 64,
      });
    }
  },
};
