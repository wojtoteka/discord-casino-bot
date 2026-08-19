import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildAdminHubPayload } from '../../utils/adminHub';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-statystyki')
    .setNameLocalizations(slashNameLocales('admin-stats'))
    .setDescription('[ADMIN] Panel: statystyki, gry, sesje, nowi, obserwowani')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Panel: stats, games, sessions, new users, watched')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const payload = await buildAdminHubPayload(getAdminDb(interaction), interaction.client, 'stats');
    await interaction.editReply(payload);
  },
};
