import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-zablokuj')
    .setDescription('[ADMIN] Zablokuj użytkownika w bocie')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik do zablokowania')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('powód')
        .setDescription('Powód blokady')
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
    const reason = interaction.options.getString('powód', true);

    if (targetUser.id === ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Nie możesz zablokować samego siebie!'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    try {
      const isBlocked = await client.db.isUserBlocked(targetUser.id);
      
      if (isBlocked) {
        const embed = EmbedHelper.warningEmbed(
          '⚠️ Już Zablokowany',
          `Użytkownik **${targetUser.username}** jest już zablokowany.`
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      await client.db.blockUser(targetUser.id, reason);

      const embed = EmbedHelper.successEmbed(
        '🔒 Użytkownik Zablokowany',
        `**Użytkownik:** ${targetUser.username}\n` +
        `**ID:** ${targetUser.id}\n` +
        `**Powód:** ${reason}\n\n` +
        `Użytkownik nie będzie mógł korzystać z komend bota.`
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd blokowania użytkownika:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas blokowania użytkownika.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
