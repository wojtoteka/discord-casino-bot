import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { slashLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import { buildAdminPanel } from '../../utils/adminPanel';
import { EmbedHelper } from '../../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('🎛️ [ADMIN] Centrum dowodzenia: pulpit, gracze, serwery, eventy')
    .setDescriptionLocalizations(slashLocales('🎛️ [ADMIN] Control room: dashboard, players, servers, events')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    try {
      await interaction.editReply(await buildAdminPanel(getAdminDb(interaction), interaction.client));
    } catch (error) {
      console.error('[ADMIN BOT] Błąd panelu:', error);
      await interaction.editReply({ embeds: [EmbedHelper.errorEmbed('❌ Panel', 'Nie udało się zbudować panelu - sprawdź logi.')] });
    }
  },
};
