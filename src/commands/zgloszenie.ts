import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { CasinoBot } from '../index';
import { BRAND, COLORS } from '../config/constants';
import { EmbedHelper } from '../utils/helpers';
import { asQuote, brandTitle, pendingList } from '../utils/embeds';
import { withOwner } from '../utils/components';
import { ADMIN_ID } from '../utils/adminShared';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import type { ReportType } from '../database/Database';

const REPORT_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_DESC = 10;
const MAX_DESC = 1000;
const REPORT_TYPES = new Set<ReportType>(['bug', 'naduzycie', 'inne']);
const DESC_INPUT_ID = 'opis';
const lastReportAt = new Map<string, number>();

function reportTypeLabel(type: ReportType): string {
  if (type === 'bug') return 'Bug';
  if (type === 'naduzycie') return 'Nadużycie';
  return 'Inne';
}

function parseReportType(value: unknown): ReportType | null {
  return REPORT_TYPES.has(value as ReportType) ? (value as ReportType) : null;
}

/** Minutes left on the 10 min per-user cooldown, or 0 when free to send. */
function cooldownMinutesLeft(userId: string): number {
  const elapsed = Date.now() - (lastReportAt.get(userId) ?? 0);
  if (elapsed >= REPORT_COOLDOWN_MS) return 0;
  return Math.max(1, Math.ceil((REPORT_COOLDOWN_MS - elapsed) / 60000));
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
        name: 'Otwórz w panelu',
        value: `\`/admin-zgloszenia\` → zgloszenie: **${input.reportId}**`,
        inline: false,
      },
    )
    .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
    .setTimestamp();
}

/** Type picker shown by `/zgłoszenie`; the description itself is collected in a modal. */
function buildReportPickerView(ownerId: string, lang: Lang, reportedId: string | null) {
  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'report_title')))
    .setColor(COLORS.info)
    .setDescription(pendingList(
      t(lang, 'report_desc'),
      reportedId ? [[t(lang, 'report_about_label'), `<@${reportedId}>`]] : [],
    ))
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId(withOwner(`report_type:${reportedId ?? '-'}`, ownerId))
    .setPlaceholder(t(lang, 'report_placeholder'))
    .addOptions(
      { value: 'bug', label: t(lang, 'report_type_bug'), emoji: '🐛' },
      { value: 'naduzycie', label: t(lang, 'report_type_abuse'), emoji: '🚨' },
      { value: 'inne', label: t(lang, 'report_type_other'), emoji: '💬' },
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

/** Type chosen in the picker → open the description modal. */
export async function handleReportTypeSelect(
  interaction: StringSelectMenuInteraction,
  client: CasinoBot,
  reportedIdRaw: string,
): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  const type = parseReportType(interaction.values[0]);
  if (!type) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'error_generic'))],
      flags: 64,
    });
    return;
  }

  const minutesLeft = cooldownMinutesLeft(interaction.user.id);
  if (minutesLeft > 0) {
    await interaction.reply({
      embeds: [EmbedHelper.warningEmbed(
        t(lang, 'report_title'),
        t(lang, 'report_rate')(String(minutesLeft)),
      )],
      flags: 64,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`report_form:${type}:${reportedIdRaw || '-'}`)
    .setTitle(t(lang, 'report_modal_title'))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(DESC_INPUT_ID)
          .setLabel(t(lang, 'report_modal_label'))
          .setPlaceholder(t(lang, 'report_modal_placeholder'))
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(MIN_DESC)
          .setMaxLength(MAX_DESC)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

/** Modal submitted → validate, persist, and DM the owner. */
export async function handleReportModal(
  interaction: ModalSubmitInteraction,
  client: CasinoBot,
): Promise<void> {
  const userId = interaction.user.id;
  const lang = await getUserLang(client.db, userId);
  const parts = interaction.customId.split(':');
  const type = parseReportType(parts[1]);
  const reportedId = parts[2] && parts[2] !== '-' ? parts[2] : null;

  if (!type) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'report_title'), t(lang, 'error_generic'))],
      flags: 64,
    });
    return;
  }

  const minutesLeft = cooldownMinutesLeft(userId);
  if (minutesLeft > 0) {
    await interaction.reply({
      embeds: [EmbedHelper.warningEmbed(
        t(lang, 'report_title'),
        t(lang, 'report_rate')(String(minutesLeft)),
      )],
      flags: 64,
    });
    return;
  }

  const description = interaction.fields.getTextInputValue(DESC_INPUT_ID).replace(/\s+/g, ' ').trim();
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

  let reportId = 0;
  try {
    reportId = await client.db.createReport({
      reporterId: userId,
      reportedId,
      type,
      description,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
  } catch (error) {
    console.error('[ROYALCASINO] Błąd zapisu zgłoszenia:', error);
  }

  if (!reportId) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))],
      flags: 64,
    });
    return;
  }

  const now = Date.now();
  lastReportAt.set(userId, now);
  setTimeout(() => {
    if (lastReportAt.get(userId) === now) lastReportAt.delete(userId);
  }, REPORT_COOLDOWN_MS);

  await interaction.reply({
    embeds: [EmbedHelper.successEmbed(t(lang, 'report_title'), t(lang, 'report_success')(reportId))],
    flags: 64,
  });

  const channelName = interaction.channel && 'name' in interaction.channel
    ? String(interaction.channel.name ?? '')
    : null;
  const reported = reportedId
    ? await client.users.fetch(reportedId).catch(() => null)
    : null;

  try {
    const owner = await client.users.fetch(ADMIN_ID);
    await owner.send({
      embeds: [buildReportAlertEmbed({
        reportId,
        type,
        reporterId: userId,
        reporterTag: interaction.user.username,
        reportedId,
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
}

export default {
  data: new SlashCommandBuilder()
    .setName('zgłoszenie')
    .setNameLocalizations(slashNameLocales('report'))
    .setDescription('🚨 Zgłoś błąd, nadużycie albo inny problem do właściciela bota')
    .setDescriptionLocalizations(slashLocales('🚨 Report a bug, abuse, or other issue to the bot owner'))
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

    const minutesLeft = cooldownMinutesLeft(userId);
    if (minutesLeft > 0) {
      await interaction.reply({
        embeds: [EmbedHelper.warningEmbed(
          t(lang, 'report_title'),
          t(lang, 'report_rate')(String(minutesLeft)),
        )],
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

    await interaction.reply({
      ...buildReportPickerView(userId, lang, reported?.id ?? null),
      flags: 64,
    });
  },
};
