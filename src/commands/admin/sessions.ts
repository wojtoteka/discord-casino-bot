import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildAdminHubPayload } from '../../utils/adminHub';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-sesje')
    .setNameLocalizations(slashNameLocales('admin-sessions'))
    .setDescription('[ADMIN] Aktywne sesje min (i inne zapisane, jeśli są)')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Active mines sessions (and other persisted sessions)')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const payload = await buildAdminHubPayload(getAdminDb(interaction), interaction.client, 'sessions');
    await interaction.editReply(payload);
  },
};
