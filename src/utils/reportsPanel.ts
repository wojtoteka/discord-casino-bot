import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageComponentInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { BRAND, COLORS } from '../config/constants';
import { EmbedHelper } from './helpers';
import { asQuote } from './embeds';
import type { Database, ReportRow, ReportType } from '../database/Database';

/**
 * Interactive report inbox for the admin bot.
 *
 * All panel state (status filter, type filter, page, opened report) lives in the
 * customId, so the panel survives restarts and needs no server-side session:
 *   admin_rep:<action>:<status>:<type>:<page>:<value>
 * The admin bot already rejects every interaction from anyone but ADMIN_ID, so
 * no ownership segment is needed here.
 */

export const REPORTS_PAGE_SIZE = 5;

const TYPE_FILTERS = ['all', 'bug', 'naduzycie', 'inne'] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
type StatusFilter = 'open' | 'all';

export interface ReportsPanelState {
  status: StatusFilter;
  type: TypeFilter;
  page: number;
}

function parseStatus(raw: string | undefined): StatusFilter {
  return raw === 'all' ? 'all' : 'open';
}

function parseType(raw: string | undefined): TypeFilter {
  return TYPE_FILTERS.includes(raw as TypeFilter) ? (raw as TypeFilter) : 'all';
}

function parsePage(raw: string | undefined): number {
  const page = parseInt(raw ?? '0', 10);
  return Number.isFinite(page) && page > 0 ? page : 0;
}

function typeLabel(type: ReportType): string {
  if (type === 'bug') return 'Bug';
  if (type === 'naduzycie') return 'Nadużycie';
  return 'Inne';
}

function typeEmoji(type: ReportType): string {
  if (type === 'bug') return '🐛';
  if (type === 'naduzycie') return '🚨';
  return '💬';
}

function statusLabel(status: ReportRow['status']): string {
  return status === 'closed' ? '✅ zamknięte' : '🟡 otwarte';
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function relativeTime(createdAt: number): string {
  return createdAt ? `<t:${Math.floor(createdAt / 1000)}:R>` : '—';
}

function customId(action: string, state: ReportsPanelState, value: string | number = '-'): string {
  return `admin_rep:${action}:${state.status}:${state.type}:${state.page}:${value}`;
}

function filterQuery(state: ReportsPanelState) {
  return {
    status: state.status,
    type: state.type === 'all' ? undefined : (state.type as ReportType),
  };
}

function listLine(row: ReportRow): string {
  const reported = row.reported_id ? `<@${row.reported_id}>` : '—';
  return [
    `${typeEmoji(row.type)} **#${row.id}** · ${typeLabel(row.type)} · ${statusLabel(row.status)} · ${relativeTime(row.created_at)}`,
    `Zgłosił: <@${row.reporter_id}> · Dotyczy: ${reported}`,
    asQuote(clip(row.description, 160)),
  ].join('\n');
}

function typeFilterRow(state: ReportsPanelState): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = [
    { value: 'all', label: 'Wszystkie rodzaje', emoji: '📋' },
    { value: 'bug', label: 'Bug', emoji: '🐛' },
    { value: 'naduzycie', label: 'Nadużycie', emoji: '🚨' },
    { value: 'inne', label: 'Inne', emoji: '💬' },
  ].map(option => ({ ...option, default: option.value === state.type }));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('type', state))
      .setPlaceholder('Filtruj rodzaj zgłoszenia')
      .addOptions(options),
  );
}

function openReportRow(
  state: ReportsPanelState,
  rows: ReportRow[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('open', state))
      .setPlaceholder('Otwórz zgłoszenie…')
      .addOptions(rows.map(row => ({
        value: String(row.id),
        label: `#${row.id} · ${typeLabel(row.type)}`,
        description: clip(row.description, 90) || '—',
        emoji: typeEmoji(row.type),
      }))),
  );
}

function navRow(
  state: ReportsPanelState,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  const nextStatus: StatusFilter = state.status === 'open' ? 'all' : 'open';
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('nav', state, state.page - 1))
      .setLabel('◀ Poprzednia')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page <= 0),
    new ButtonBuilder()
      .setCustomId(customId('nav', state, state.page + 1))
      .setLabel('Następna ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(customId('status', state, nextStatus))
      .setEmoji(state.status === 'open' ? '📂' : '🟡')
      .setLabel(state.status === 'open' ? 'Pokaż wszystkie' : 'Tylko otwarte')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('refresh', state))
      .setEmoji('🔄')
      .setLabel('Odśwież')
      .setStyle(ButtonStyle.Secondary),
  );
}

function detailRow(state: ReportsPanelState, report: ReportRow): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('close', state, report.id))
      .setEmoji('✅')
      .setLabel(report.status === 'closed' ? 'Już zamknięte' : 'Zamknij zgłoszenie')
      .setStyle(ButtonStyle.Success)
      .setDisabled(report.status === 'closed'),
    new ButtonBuilder()
      .setCustomId(customId('back', state))
      .setLabel('◀ Wróć do listy')
      .setStyle(ButtonStyle.Secondary),
  );
}

type PanelPayload = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
};

export async function buildReportsListPayload(
  db: Database,
  state: ReportsPanelState,
): Promise<PanelPayload> {
  const query = filterQuery(state);
  const total = await db.countReports(query);
  const totalPages = Math.max(1, Math.ceil(total / REPORTS_PAGE_SIZE));
  const page = Math.min(Math.max(0, state.page), totalPages - 1);
  const safeState: ReportsPanelState = { ...state, page };

  const rows = total === 0
    ? []
    : await db.getReports({
      ...query,
      limit: REPORTS_PAGE_SIZE,
      offset: page * REPORTS_PAGE_SIZE,
    });

  const filterHint = [
    state.status === 'all' ? 'status: **wszystkie**' : 'status: **otwarte**',
    state.type === 'all' ? 'rodzaj: **wszystkie**' : `rodzaj: **${typeLabel(state.type as ReportType)}**`,
    `strona **${page + 1}/${totalPages}**`,
  ].join(' · ');

  if (rows.length === 0) {
    const empty = state.status === 'all'
      ? 'Brak zgłoszeń dla tego filtra.'
      : 'Brak otwartych zgłoszeń. Czysto! ✨';
    return {
      embeds: [EmbedHelper.infoEmbed('📥 Skrzynka zgłoszeń', `${filterHint}\n\n${empty}`)],
      components: [typeFilterRow(safeState), navRow(safeState, totalPages)],
    };
  }

  const body = rows.map(listLine).join('\n\n');
  const embed = new EmbedBuilder()
    .setTitle(`📥 Skrzynka zgłoszeń (${total})`)
    .setColor(COLORS.info)
    .setDescription(`${filterHint}\n\n${body}`.slice(0, 4000))
    .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [typeFilterRow(safeState), openReportRow(safeState, rows), navRow(safeState, totalPages)],
  };
}

function buildReportDetailPayload(state: ReportsPanelState, report: ReportRow): PanelPayload {
  const reported = report.reported_id
    ? `<@${report.reported_id}> (\`${report.reported_id}\`)`
    : '—';

  const embed = new EmbedBuilder()
    .setTitle(`${typeEmoji(report.type)} Zgłoszenie #${report.id}`)
    .setColor(report.status === 'closed' ? COLORS.dark : COLORS.warning)
    .setDescription(asQuote(report.description).slice(0, 3800))
    .addFields(
      { name: 'Rodzaj', value: typeLabel(report.type), inline: true },
      { name: 'Status', value: statusLabel(report.status), inline: true },
      { name: 'Kiedy', value: relativeTime(report.created_at), inline: true },
      {
        name: 'Zgłaszający',
        value: `<@${report.reporter_id}> (\`${report.reporter_id}\`)`,
        inline: false,
      },
      { name: 'Dotyczy', value: reported, inline: false },
      {
        name: 'Serwer',
        value: report.guild_id ? `\`${report.guild_id}\`` : 'DM',
        inline: true,
      },
      {
        name: 'Kanał',
        value: report.channel_id ? `<#${report.channel_id}>` : '—',
        inline: true,
      },
    )
    .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
    .setTimestamp();

  return { embeds: [embed], components: [detailRow(state, report)] };
}

export const DEFAULT_REPORTS_STATE: ReportsPanelState = { status: 'open', type: 'all', page: 0 };

/** Detail view for one report, or null when the id does not exist. */
export async function buildReportDetailById(
  db: Database,
  reportId: number,
): Promise<PanelPayload | null> {
  const report = await db.getReportById(reportId);
  if (!report) return null;
  return buildReportDetailPayload(DEFAULT_REPORTS_STATE, report);
}

async function showReport(
  db: Database,
  interaction: MessageComponentInteraction,
  state: ReportsPanelState,
  reportId: number,
): Promise<void> {
  const report = await db.getReportById(reportId);
  if (!report) {
    await interaction.editReply(await buildReportsListPayload(db, state));
    await interaction.followUp({
      embeds: [EmbedHelper.errorEmbed('❌ Zgłoszenia', `Nie znaleziono zgłoszenia **#${reportId}**.`)],
      flags: 64,
    }).catch(() => {});
    return;
  }
  await interaction.editReply(buildReportDetailPayload(state, report));
}

export async function handleReportsPanel(
  db: Database,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const state: ReportsPanelState = {
    status: parseStatus(parts[2]),
    type: parseType(parts[3]),
    page: parsePage(parts[4]),
  };
  const value = parts[5];

  await interaction.deferUpdate();

  if (action === 'type' && interaction.isStringSelectMenu()) {
    const next: ReportsPanelState = { ...state, type: parseType(interaction.values[0]), page: 0 };
    await interaction.editReply(await buildReportsListPayload(db, next));
    return;
  }

  if (action === 'open' && interaction.isStringSelectMenu()) {
    const reportId = parseInt(interaction.values[0], 10);
    if (!Number.isFinite(reportId)) {
      await interaction.editReply(await buildReportsListPayload(db, state));
      return;
    }
    await showReport(db, interaction, state, reportId);
    return;
  }

  if (action === 'nav') {
    await interaction.editReply(await buildReportsListPayload(db, { ...state, page: parsePage(value) }));
    return;
  }

  if (action === 'status') {
    await interaction.editReply(await buildReportsListPayload(db, {
      ...state,
      status: parseStatus(value),
      page: 0,
    }));
    return;
  }

  if (action === 'close') {
    const reportId = parseInt(value, 10);
    if (!Number.isFinite(reportId)) {
      await interaction.editReply(await buildReportsListPayload(db, state));
      return;
    }
    const closed = await db.closeReport(reportId);
    await showReport(db, interaction, state, reportId);
    await interaction.followUp({
      embeds: [closed
        ? EmbedHelper.successEmbed('📥 Zgłoszenia', `Zamknięto zgłoszenie **#${reportId}**.`)
        : EmbedHelper.warningEmbed('📥 Zgłoszenia', `Zgłoszenie **#${reportId}** było już zamknięte.`)],
      flags: 64,
    }).catch(() => {});
    return;
  }

  // back / refresh / anything unexpected → current list
  await interaction.editReply(await buildReportsListPayload(db, state));
}
