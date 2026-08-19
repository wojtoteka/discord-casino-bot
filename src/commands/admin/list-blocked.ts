import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { buildBlockedListPayload, denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-lista-zablokowanych')
    .setNameLocalizations(slashNameLocales('admin-list-blocked'))
    .setDescription('[ADMIN] Wyświetl listę zablokowanych użytkowników')
    .setDescriptionLocalizations(slashLocales('[ADMIN] List blocked users')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    try {
      const payload = await buildBlockedListPayload(getAdminDb(interaction), interaction.client, 0);
      await interaction.reply({ ...payload, flags: 64 });
    } catch (error) {
      console.error('Błąd pobierania listy zablokowanych:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas pobierania listy zablokowanych użytkowników.')],
        flags: 64,
      });
    }
  },
};
