import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, runMoneyChange } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-dodaj-pieniadze')
    .setNameLocalizations(slashNameLocales('admin-add-money'))
    .setDescription('💰 [ADMIN] Dodaj pieniądze użytkownikowi')
    .setDescriptionLocalizations(slashLocales('💰 [ADMIN] Add money to a user'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik do którego dodać pieniądze')
        .setDescriptionLocalizations(slashLocales('User to add money to'))
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Kwota do dodania')
        .setDescriptionLocalizations(slashLocales('Amount to add'))
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
        op: 'add-money',
        targetId: targetUser.id,
        targetLabel: targetUser.username,
        amount,
        reason,
      });
    } catch (error) {
      console.error('Błąd dodawania pieniędzy:', error);
      const embed = EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas dodawania pieniędzy.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: 64 });
      } else {
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    }
  },
};
