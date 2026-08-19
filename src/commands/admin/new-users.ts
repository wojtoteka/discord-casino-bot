import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildAdminHubPayload } from '../../utils/adminHub';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-nowi')
    .setNameLocalizations(slashNameLocales('admin-new-users'))
    .setDescription('🆕 [ADMIN] Konta utworzone w ostatnich 24h (alts)')
    .setDescriptionLocalizations(slashLocales('🆕 [ADMIN] Accounts created in the last 24h (alt check)')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const payload = await buildAdminHubPayload(getAdminDb(interaction), interaction.client, 'new');
    await interaction.editReply(payload);
  },
};
