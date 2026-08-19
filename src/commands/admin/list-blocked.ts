import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-lista-zablokowanych')
    .setDescription('[ADMIN] Wyświetl listę zablokowanych użytkowników'),

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
      const blockedUsers = await client.db.getBlockedUsers();

      if (blockedUsers.length === 0) {
        const embed = EmbedHelper.infoEmbed(
          '🔒 Zablokowani Użytkownicy',
          'Brak zablokowanych użytkowników.'
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      let description = '';
      for (const user of blockedUsers) {
        try {
          const discordUser = await client.users.fetch(user.user_id);
          const blockedDate = user.blocked_at ? new Date(user.blocked_at).toLocaleDateString('pl-PL') : 'N/A';
          description += `**${discordUser.username}** (ID: ${user.user_id})\n`;
          description += `📅 Zablokowano: ${blockedDate}\n`;
          description += `📝 Powód: ${user.blocked_reason || 'Brak powodu'}\n\n`;
        } catch (error) {
          description += `**Nieznany Użytkownik** (ID: ${user.user_id})\n`;
          description += `📝 Powód: ${user.blocked_reason || 'Brak powodu'}\n\n`;
        }
      }

      const embed = EmbedHelper.infoEmbed(
        `🔒 Zablokowani Użytkownicy (${blockedUsers.length})`,
        description || 'Brak danych'
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd pobierania listy zablokowanych:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas pobierania listy zablokowanych użytkowników.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
