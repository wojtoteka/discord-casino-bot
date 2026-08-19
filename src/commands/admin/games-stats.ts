import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildAdminHubPayload } from '../../utils/adminHub';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-gry')
    .setNameLocalizations(slashNameLocales('admin-games'))
    .setDescription('[ADMIN] Wolumen gier 24h i 7d (z game_history)')
    .setDescriptionLocalizations(slashLocales('[ADMIN] 24h and 7d game volume from game_history')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const payload = await buildAdminHubPayload(getAdminDb(interaction), interaction.client, 'games');
    await interaction.editReply(payload);
  },
};
