import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, runMoneyChange } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-usun-pieniadze')
    .setNameLocalizations(slashNameLocales('admin-remove-money'))
    .setDescription('💸 [ADMIN] Usuń pieniądze użytkownikowi')
    .setDescriptionLocalizations(slashLocales('💸 [ADMIN] Remove money from a user'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik od którego usunąć pieniądze')
        .setDescriptionLocalizations(slashLocales('User to remove money from'))
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Kwota do usunięcia')
        .setDescriptionLocalizations(slashLocales('Amount to remove'))
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option
        .setName('powód')
        .setNameLocalizations(slashNameLocales('reason'))
        .setDescription('Powód zmiany')
        .setDescriptionLocalizations(slashLocales('Reason for the change'))
        .setRequired(true)
        .setMaxLength(200)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const targetUser = interaction.options.getUser('użytkownik', true);
    const amount = interaction.options.getInteger('kwota', true);
    const reason = interaction.options.getString('powód', true);

    try {
      await runMoneyChange(interaction, {
        op: 'remove-money',
        targetId: targetUser.id,
        targetLabel: targetUser.username,
        amount,
        reason,
      });
    } catch (error) {
      console.error('Błąd usuwania pieniędzy:', error);
      const embed = EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas usuwania pieniędzy.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: 64 });
      } else {
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    }
  },
};
