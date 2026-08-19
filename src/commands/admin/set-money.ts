import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-ustaw-pieniadze')
    .setDescription('[ADMIN] Ustaw dokładną kwotę pieniędzy użytkownikowi')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setDescription('Nowa kwota pieniędzy')
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
    const amount = interaction.options.getInteger('kwota', true);

    try {
      const userData = await client.db.getUser(targetUser.id);
      const oldBalance = userData.money;
      
      await client.db.setMoney(targetUser.id, amount);

      const embed = EmbedHelper.successEmbed(
        '✅ Pieniądze Ustawione',
        `**Użytkownik:** ${targetUser.username}\n\n` +
        `**Poprzedni balans:** $${oldBalance.toLocaleString()}\n` +
        `**Nowy balans:** $${amount.toLocaleString()}`
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd ustawiania pieniędzy:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas ustawiania pieniędzy.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
