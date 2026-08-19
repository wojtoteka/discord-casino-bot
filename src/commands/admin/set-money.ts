import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, runMoneyChange } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-ustaw-pieniadze')
    .setNameLocalizations(slashNameLocales('admin-set-money'))
    .setDescription('🏦 [ADMIN] Ustaw dokładną kwotę pieniędzy użytkownikowi')
    .setDescriptionLocalizations(slashLocales('🏦 [ADMIN] Set an exact money amount for a user'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik')
        .setDescriptionLocalizations(slashLocales('User'))
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Nowa kwota pieniędzy')
        .setDescriptionLocalizations(slashLocales('New money amount'))
        .setRequired(true)
        .setMinValue(0)
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
        op: 'set-money',
        targetId: targetUser.id,
        targetLabel: targetUser.username,
        amount,
        reason,
      });
    } catch (error) {
      console.error('Błąd ustawiania pieniędzy:', error);
      const embed = EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas ustawiania pieniędzy.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: 64 });
      } else {
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    }
  },
};
