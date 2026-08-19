import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-usun-pieniadze')
    .setDescription('[ADMIN] Usuń pieniądze użytkownikowi')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik od którego usunąć pieniądze')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setDescription('Kwota do usunięcia')
        .setRequired(true)
        .setMinValue(1)
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
      
      await client.db.updateMoney(targetUser.id, -amount);
      const newUserData = await client.db.getUser(targetUser.id);

      const embed = EmbedHelper.successEmbed(
        '✅ Pieniądze Usunięte',
        `**Użytkownik:** ${targetUser.username}\n` +
        `**Usunięto:** $${amount.toLocaleString()}\n\n` +
        `**Poprzedni balans:** $${oldBalance.toLocaleString()}\n` +
        `**Nowy balans:** $${newUserData.money.toLocaleString()}`
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd usuwania pieniędzy:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas usuwania pieniędzy.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
