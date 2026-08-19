import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-odblokuj')
    .setDescription('[ADMIN] Odblokuj użytkownika w bocie')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik do odblokowania')
        .setRequired(true)
    ),

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
    const targetUser = interaction.options.getUser('użytkownik', true);

    try {
      const isBlocked = await client.db.isUserBlocked(targetUser.id);
      
      if (!isBlocked) {
        const embed = EmbedHelper.warningEmbed(
          '⚠️ Nie Jest Zablokowany',
          `Użytkownik **${targetUser.username}** nie jest zablokowany.`
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      await client.db.unblockUser(targetUser.id);

      const embed = EmbedHelper.successEmbed(
        '🔓 Użytkownik Odblokowany',
        `**Użytkownik:** ${targetUser.username}\n` +
        `**ID:** ${targetUser.id}\n\n` +
        `Użytkownik może ponownie korzystać z komend bota.`
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd odblokowywania użytkownika:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas odblokowywania użytkownika.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
