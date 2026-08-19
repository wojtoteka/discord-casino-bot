import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { BRAND, COLORS } from '../config/constants';
import { EmbedHelper } from '../utils/helpers';
import { asQuote } from '../utils/embeds';
import { ADMIN_ID } from '../utils/adminShared';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import type { ReportType } from '../database/Database';

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

function guildLabel(guildId: string | null | undefined, guildName?: string | null): string {
  if (!guildId) return 'DM';
  if (guildName) return `${guildName} (\`${guildId}\`)`;
  return `\`${guildId}\``;
}

function channelLabel(
  channelId: string | null | undefined,
  channelName?: string | null,
): string {
  if (!channelId) return '—';
  if (channelName) return `${channelName} (\`${channelId}\`)`;
  return `<#${channelId}> (\`${channelId}\`)`;
}

function buildReportAlertEmbed(input: {
  reportId: number;
  type: ReportType;
  reporterId: string;
  reporterTag?: string | null;
  reportedId?: string | null;
  reportedTag?: string | null;
  guildId?: string | null;
  guildName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  description: string;
}): EmbedBuilder {
  const reportedValue = input.reportedId
    ? (input.reportedTag
      ? `${input.reportedTag} (\`${input.reportedId}\`)`
      : `\`${input.reportedId}\``)
    : '—';
  const reporterValue = input.reporterTag
    ? `${input.reporterTag} (\`${input.reporterId}\`)`
    : `\`${input.reporterId}\``;

  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`Nowe zgłoszenie #${input.reportId}`)
    .setDescription(asQuote(input.description).slice(0, 3900))
    .addFields(
      { name: 'Typ', value: reportTypeLabel(input.type), inline: true },
      { name: 'Zgłaszający', value: reporterValue.slice(0, 1024), inline: true },
      { name: 'Użytkownik', value: reportedValue.slice(0, 1024), inline: true },
      { name: 'Serwer', value: guildLabel(input.guildId, input.guildName), inline: true },
      { name: 'Kanał', value: channelLabel(input.channelId, input.channelName), inline: true },
      {
        name: 'Zamknij',
        value: `\`/admin-zgloszenia\` → zamknij: **${input.reportId}**`,
        inline: false,
      },
    )
    .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
    .setTimestamp();
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

    const channelName = interaction.channel && 'name' in interaction.channel
      ? String(interaction.channel.name ?? '')
      : null;

    try {
      const owner = await interaction.client.users.fetch(ADMIN_ID);
      await owner.send({
        embeds: [buildReportAlertEmbed({
          reportId,
          type,
          reporterId: userId,
          reporterTag: interaction.user.username,
          reportedId: reported?.id ?? null,
          reportedTag: reported?.username ?? null,
          guildId: interaction.guildId,
          guildName: interaction.guild?.name ?? null,
          channelId: interaction.channelId,
          channelName,
          description,
        })],
      });
    } catch (error) {
      console.warn('[ROYALCASINO] Nie udało się wysłać DM ze zgłoszeniem:', error);
    }

    await interaction.reply({
      embeds: [EmbedHelper.successEmbed(t(lang, 'report_title'), t(lang, 'report_success')(reportId))],
      flags: 64,
    });
  },
};
