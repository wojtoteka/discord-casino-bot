import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildAdminHubPayload } from '../../utils/adminHub';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-obserwowani')
    .setNameLocalizations(slashNameLocales('admin-watched'))
    .setDescription('📒 [ADMIN] Lista obserwowanych graczy')
    .setDescriptionLocalizations(slashLocales('📒 [ADMIN] List watched users')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const payload = await buildAdminHubPayload(getAdminDb(interaction), interaction.client, 'watched');
    await interaction.editReply(payload);
  },
};
