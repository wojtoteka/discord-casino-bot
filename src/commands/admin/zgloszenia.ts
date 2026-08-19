import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import {
  buildReportDetailById,
  buildReportsListPayload,
  DEFAULT_REPORTS_STATE,
} from '../../utils/reportsPanel';
import { slashLocales, slashNameLocales } from '../../i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-zgloszenia')
    .setNameLocalizations(slashNameLocales('admin-reports'))
    .setDescription('[ADMIN] Panel skrzynki zgłoszeń graczy')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Player report inbox panel'))
    .addIntegerOption(option =>
      option
        .setName('zgloszenie')
        .setNameLocalizations(slashNameLocales('report'))
        .setDescription('Otwórz od razu konkretne zgłoszenie po ID')
        .setDescriptionLocalizations(slashLocales('Jump straight to a specific report ID'))
        .setMinValue(1)
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    const reportId = interaction.options.getInteger('zgloszenie');

    try {
      if (reportId != null) {
        const detail = await buildReportDetailById(db, reportId);
        if (!detail) {
          await interaction.reply({
            embeds: [EmbedHelper.errorEmbed(
              '❌ Zgłoszenia',
              `Nie znaleziono zgłoszenia **#${reportId}**.`,
            )],
            flags: 64,
          });
          return;
        }
        await interaction.reply({ ...detail, flags: 64 });
        return;
      }

      const payload = await buildReportsListPayload(db, DEFAULT_REPORTS_STATE);
      await interaction.reply({ ...payload, flags: 64 });
    } catch (error) {
      console.error('[ADMIN BOT] Błąd skrzynki zgłoszeń:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas pobierania zgłoszeń.')],
        flags: 64,
      });
    }
  },
};
