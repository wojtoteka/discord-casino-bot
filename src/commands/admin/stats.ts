import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-statystyki')
    .setDescription('[ADMIN] Wyświetl statystyki bota'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '🚫 Brak Dostępu',
        'Nie masz uprawnień do używania tej komendy!\nTa komenda jest dostępna tylko dla administratora.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const client = interaction.client as CasinoBot;

    try {
      const stats = await client.db.getUserStats();
      const guilds = client.guilds.cache.size;

      let description = `**🎮 Serwery:** ${guilds}\n\n`;
      description += `**👥 Użytkownicy w bazie:** ${stats.total}\n`;
      description += `**🔒 Zablokowani:** ${stats.blocked}\n`;
      description += `**✅ Aktywni:** ${stats.total - stats.blocked}\n\n`;
      description += `**💰 Całkowita wartość pieniędzy:** $${stats.totalMoney.toLocaleString()}\n`;
      description += `**💵 Średnio na użytkownika:** $${Math.floor(stats.totalMoney / (stats.total || 1)).toLocaleString()}`;

      const embed = EmbedHelper.infoEmbed(
        '📊 Statystyki Bota',
        description
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd pobierania statystyk:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas pobierania statystyk.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
