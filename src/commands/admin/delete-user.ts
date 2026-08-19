import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-usun-uzytkownika')
    .setDescription('[ADMIN] Usuń użytkownika z bazy danych')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik do usunięcia')
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

    if (targetUser.id === ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Nie możesz usunąć samego siebie!'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    try {
      const userData = await client.db.getUser(targetUser.id);
      
      await client.db.deleteUser(targetUser.id);

      const embed = EmbedHelper.successEmbed(
        '🗑️ Użytkownik Usunięty',
        `**Użytkownik:** ${targetUser.username}\n` +
        `**ID:** ${targetUser.id}\n\n` +
        `**Utracone dane:**\n` +
        `💰 Pieniądze: $${userData.money.toLocaleString()}\n` +
        `🎟️ Kredyty: ${userData.credits.toLocaleString()}\n\n` +
        `Użytkownik został całkowicie usunięty z bazy danych.`
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd usuwania użytkownika:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas usuwania użytkownika.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
