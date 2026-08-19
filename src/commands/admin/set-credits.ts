import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-ustaw-kredyty')
    .setDescription('[ADMIN] Ustaw dokładną ilość kredytów użytkownikowi')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('ilość')
        .setDescription('Nowa ilość kredytów')
        .setRequired(true)
        .setMinValue(0)
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
    const amount = interaction.options.getInteger('ilość', true);

    try {
      const userData = await client.db.getUser(targetUser.id);
      const oldCredits = userData.credits;
      
      await client.db.setCredits(targetUser.id, amount);

      const embed = EmbedHelper.successEmbed(
        '✅ Kredyty Ustawione',
        `**Użytkownik:** ${targetUser.username}\n\n` +
        `**Poprzednie kredyty:** ${oldCredits.toLocaleString()}\n` +
        `**Nowe kredyty:** ${amount.toLocaleString()}`
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd ustawiania kredytów:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas ustawiania kredytów.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
