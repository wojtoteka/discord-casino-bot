import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { asQuote } from '../utils/embeds';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import type { ReportType } from '../database/Database';

const ADMIN_ID = '1328758394588500024';
const REPORT_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_DESC = 10;
const MAX_DESC = 1000;
const REPORT_TYPES = new Set<ReportType>(['bug', 'naduzycie', 'inne']);
const lastReportAt = new Map<string, number>();

function reportTypeLabel(type: ReportType): string {
  if (type === 'bug') return 'Bug';
  if (type === 'naduzycie') return 'Nadużycie';
  return 'Inne';
}

export default {
  data: new SlashCommandBuilder()
    .setName('zgłoszenie')
    .setNameLocalizations(slashNameLocales('report'))
    .setDescription('Zgłoś błąd, nadużycie albo inny problem do właściciela bota')
    .setDescriptionLocalizations(slashLocales('Report a bug, abuse, or other issue to the bot owner'))
    .addStringOption(option =>
      option
        .setName('typ')
        .setNameLocalizations(slashNameLocales('type'))
        .setDescription('Rodzaj zgłoszenia')
        .setDescriptionLocalizations(slashLocales('Kind of report'))
        .setRequired(true)
        .addChoices(
          { name: 'Bug', name_localizations: slashNameLocales('Bug'), value: 'bug' },
          { name: 'Nadużycie', name_localizations: slashNameLocales('Abuse'), value: 'naduzycie' },
          { name: 'Inne', name_localizations: slashNameLocales('Other'), value: 'inne' },
        ),
    )
    .addStringOption(option =>
      option
        .setName('opis')
        .setNameLocalizations(slashNameLocales('description'))
        .setDescription('Opisz problem (10–1000 znaków)')
        .setDescriptionLocalizations(slashLocales('Describe the issue (10–1000 characters)'))
        .setRequired(true)
        .setMinLength(MIN_DESC)
        .setMaxLength(MAX_DESC),
    )
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Osoba, której dotyczy zgłoszenie (np. nadużycie)')
        .setDescriptionLocalizations(slashLocales('User this report is about (e.g. abuse)'))
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const lang = await getUserLang(client.db, userId);

    const now = Date.now();
    const lastAt = lastReportAt.get(userId) ?? 0;
    if (now - lastAt < REPORT_COOLDOWN_MS) {
      const minutesLeft = Math.max(1, Math.ceil((REPORT_COOLDOWN_MS - (now - lastAt)) / 60000));
      await interaction.reply({
        embeds: [EmbedHelper.warningEmbed(
          t(lang, 'report_title'),
          t(lang, 'report_rate')(String(minutesLeft)),
        )],
        flags: 64,
      });
      return;
    }

    const typeRaw = interaction.options.getString('typ', true);
    if (!REPORT_TYPES.has(typeRaw as ReportType)) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'error_generic'))],
        flags: 64,
      });
      return;
    }
    const type = typeRaw as ReportType;

    const description = (interaction.options.getString('opis', true) || '').replace(/\s+/g, ' ').trim();
    if (description.length < MIN_DESC) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'report_short'))],
        flags: 64,
      });
      return;
    }
    if (description.length > MAX_DESC) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'report_long'))],
        flags: 64,
      });
      return;
    }

    const reported = interaction.options.getUser('użytkownik', false);
    if (reported) {
      if (reported.id === userId) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'report_self'))],
          flags: 64,
        });
        return;
      }
      if (reported.bot) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'report_bot'))],
          flags: 64,
        });
        return;
      }
    }

    let reportId = 0;
    try {
      reportId = await client.db.createReport({
        reporterId: userId,
        reportedId: reported?.id ?? null,
        type,
        description,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });
    } catch (error) {
      console.error('[ROYALCASINO] Błąd zapisu zgłoszenia:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))],
        flags: 64,
      });
      return;
    }

    if (!reportId) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))],
        flags: 64,
      });
      return;
    }

    lastReportAt.set(userId, now);
    setTimeout(() => {
      if (lastReportAt.get(userId) === now) lastReportAt.delete(userId);
    }, REPORT_COOLDOWN_MS);

    try {
      const admin = await client.users.fetch(ADMIN_ID);
      const guildLine = interaction.guild
        ? `${interaction.guild.name} (\`${interaction.guild.id}\`)`
        : 'DM';
      const channelLine = interaction.guildId && interaction.channelId
        ? `<#${interaction.channelId}> (\`${interaction.channelId}\`)`
        : `\`${interaction.channelId}\``;
      const reportedLine = reported
        ? `${reported.username} (\`${reported.id}\`)`
        : '—';
      const embed = EmbedHelper.warningEmbed(
        `Nowe zgłoszenie #${reportId}`,
        [
          `**Typ:** ${reportTypeLabel(type)}`,
          `**Zgłaszający:** ${interaction.user.username} (\`${userId}\`)`,
          `**Użytkownik:** ${reportedLine}`,
          `**Serwer:** ${guildLine}`,
          `**Kanał:** ${channelLine}`,
          '',
          asQuote(description),
          '',
          `Zamknij: \`/admin-zgloszenia zamknij:${reportId}\``,
        ].join('\n'),
      );
      await admin.send({ embeds: [embed] });
    } catch (error) {
      console.warn('[ROYALCASINO] Nie udało się wysłać DM ze zgłoszeniem:', error);
    }

    await interaction.reply({
      embeds: [EmbedHelper.successEmbed(t(lang, 'report_title'), t(lang, 'report_success')(reportId))],
      flags: 64,
    });
  },
};
