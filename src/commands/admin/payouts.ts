import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales, slashNameLocales } from '../../i18n';
import { EmbedHelper } from '../../utils/helpers';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildPayoutsListPayload, parsePayoutFilter } from '../../utils/payoutsPanel';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-wyplaty')
    .setNameLocalizations(slashNameLocales('admin-payouts'))
    .setDescription('[ADMIN] Panel księgi wypłat')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Payout ledger panel'))
    .addStringOption(option =>
      option
        .setName('status')
        .setNameLocalizations(slashNameLocales('status'))
        .setDescription('Status, od którego otworzyć panel')
        .setDescriptionLocalizations(slashLocales('Status to open the panel on'))
        .addChoices(
          { name: 'Oczekuje', value: 'oczekuje', name_localizations: slashNameLocales('pending') },
          { name: 'Zrobione', value: 'zrobione', name_localizations: slashNameLocales('done') },
          { name: 'Odrzucone', value: 'odrzucone', name_localizations: slashNameLocales('rejected') },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const status = parsePayoutFilter(interaction.options.getString('status'));

    try {
      const payload = await buildPayoutsListPayload(getAdminDb(interaction), { status, page: 0 });
      await interaction.reply({ ...payload, flags: 64 });
    } catch (error) {
      console.error('Błąd admin-wyplaty:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać wypłat.')],
        flags: 64,
      });
    }
  },
};
