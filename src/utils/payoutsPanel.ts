import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageComponentInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { BRAND, COLORS } from '../config/constants';
import { EmbedHelper, GameHelper } from './helpers';
import { discordTime } from './adminShared';
import type { Database, PayoutRow, PayoutStatus } from '../database/Database';

/**
 * Interactive payout ledger, built like the report inbox so both admin panels
 * behave the same way. All state is in the customId:
 *   admin_pay:<action>:<status>:<page>:<value>
 */

export const PAYOUTS_PAGE_SIZE = 5;

const STATUS_FILTERS = ['all', 'oczekuje', 'zrobione', 'odrzucone'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface PayoutsPanelState {
  status: StatusFilter;
  page: number;
}

export const DEFAULT_PAYOUTS_STATE: PayoutsPanelState = { status: 'all', page: 0 };

export function parsePayoutFilter(value: unknown): StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'all';
}

function statusEmoji(status: PayoutStatus): string {
  if (status === 'zrobione') return '✅';
  if (status === 'odrzucone') return '❌';
  return '⏳';
}

function statusColor(status: PayoutStatus): number {
  if (status === 'zrobione') return COLORS.success;
  if (status === 'odrzucone') return COLORS.error;
  return COLORS.warning;
}

function filterLabel(status: StatusFilter): string {
  if (status === 'all') return 'wszystkie';
  return status;
}

function customId(action: string, state: PayoutsPanelState, value: string | number = '-'): string {
  return `admin_pay:${action}:${state.status}:${state.page}:${value}`;
}

function queryStatus(state: PayoutsPanelState): PayoutStatus | undefined {
  return state.status === 'all' ? undefined : (state.status as PayoutStatus);
}

function listLine(row: PayoutRow): string {
  const note = row.note ? `\n${'　'}${row.note}` : '';
  return (
    `${statusEmoji(row.status)} **#${row.id}** · <@${row.user_id}> · ` +
    `${GameHelper.formatCredits(row.amount)} · **${row.status}** · ${discordTime(row.created_at)}${note}`
  );
}

function statusFilterRow(state: PayoutsPanelState): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = [
    { value: 'all', label: 'Wszystkie statusy', emoji: '📋' },
    { value: 'oczekuje', label: 'Oczekuje', emoji: '⏳' },
    { value: 'zrobione', label: 'Zrobione', emoji: '✅' },
    { value: 'odrzucone', label: 'Odrzucone', emoji: '❌' },
  ].map(option => ({ ...option, default: option.value === state.status }));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('filter', state))
      .setPlaceholder('Filtruj status wypłaty')
      .addOptions(options),
  );
}

function openPayoutRow(
  state: PayoutsPanelState,
  rows: PayoutRow[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('open', state))
      .setPlaceholder('Otwórz wpis…')
      .addOptions(rows.map(row => ({
        value: String(row.id),
        label: `#${row.id} · ${row.amount} kredytów`,
        description: `${row.status} · ${row.user_id}`.slice(0, 100),
        emoji: statusEmoji(row.status),
      }))),
  );
}

function navRow(state: PayoutsPanelState, totalPages: number): ActionRowBuilder<ButtonBuilder> {
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
      .setCustomId(customId('refresh', state))
      .setEmoji('🔄')
      .setLabel('Odśwież')
      .setStyle(ButtonStyle.Secondary),
  );
}

function detailRow(state: PayoutsPanelState, payout: PayoutRow): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('set', state, `zrobione_${payout.id}`))
      .setEmoji('✅')
      .setLabel('Oznacz jako zrobione')
      .setStyle(ButtonStyle.Success)
      .setDisabled(payout.status === 'zrobione'),
    new ButtonBuilder()
      .setCustomId(customId('set', state, `odrzucone_${payout.id}`))
      .setEmoji('❌')
      .setLabel('Odrzuć')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(payout.status === 'odrzucone'),
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

export async function buildPayoutsListPayload(
  db: Database,
  state: PayoutsPanelState,
): Promise<PanelPayload> {
  const status = queryStatus(state);
  const total = await db.countPayouts(status);
  const totalPages = Math.max(1, Math.ceil(total / PAYOUTS_PAGE_SIZE));
  const page = Math.min(Math.max(0, state.page), totalPages - 1);
  const safeState: PayoutsPanelState = { ...state, page };

  const rows = total === 0
    ? []
    : await db.listPayouts(PAYOUTS_PAGE_SIZE, status, page * PAYOUTS_PAGE_SIZE);

  const filterHint = `status: **${filterLabel(state.status)}** · strona **${page + 1}/${totalPages}**`;

  if (rows.length === 0) {
    return {
      embeds: [EmbedHelper.infoEmbed('💸 Księga wypłat', `${filterHint}\n\nBrak wpisów dla tego filtra.`)],
      components: [statusFilterRow(safeState), navRow(safeState, totalPages)],
    };
  }

  const embed = new EmbedBuilder()
    .setTitle(`💸 Księga wypłat (${total})`)
    .setColor(COLORS.info)
    .setDescription(`${filterHint}\n\n${rows.map(listLine).join('\n\n')}`.slice(0, 4000))
    .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [statusFilterRow(safeState), openPayoutRow(safeState, rows), navRow(safeState, totalPages)],
  };
}

function buildPayoutDetailPayload(state: PayoutsPanelState, payout: PayoutRow): PanelPayload {
  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji(payout.status)} Wypłata #${payout.id}`)
    .setColor(statusColor(payout.status))
    .setDescription(
      'To tylko księga staffu - zmiana statusu nie rusza salda gracza.',
    )
    .addFields(
      { name: 'Użytkownik', value: `<@${payout.user_id}> (\`${payout.user_id}\`)`, inline: false },
      { name: 'Kwota', value: GameHelper.formatCredits(payout.amount), inline: true },
      { name: 'Status', value: `${statusEmoji(payout.status)} ${payout.status}`, inline: true },
      { name: 'Zapisano', value: discordTime(payout.created_at), inline: true },
      { name: 'Zapisał', value: `<@${payout.admin_id}>`, inline: true },
      { name: 'Notatka', value: (payout.note || '-').slice(0, 1024), inline: false },
    )
    .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
    .setTimestamp();

  return { embeds: [embed], components: [detailRow(state, payout)] };
}

async function showPayout(
  db: Database,
  interaction: MessageComponentInteraction,
  state: PayoutsPanelState,
  payoutId: number,
): Promise<void> {
  const payout = await db.getPayoutById(payoutId);
  if (!payout) {
    await interaction.editReply(await buildPayoutsListPayload(db, state));
    await interaction.followUp({
      embeds: [EmbedHelper.errorEmbed('❌ Wypłaty', `Nie znaleziono wpisu **#${payoutId}**.`)],
      flags: 64,
    }).catch(() => {});
    return;
  }
  await interaction.editReply(buildPayoutDetailPayload(state, payout));
}

export async function handlePayoutsPanel(
  db: Database,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const pageRaw = parseInt(parts[3] ?? '0', 10);
  const state: PayoutsPanelState = {
    status: parsePayoutFilter(parts[2]),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 0,
  };
  const value = parts[4];

  await interaction.deferUpdate();

  if (action === 'filter' && interaction.isStringSelectMenu()) {
    await interaction.editReply(await buildPayoutsListPayload(db, {
      status: parsePayoutFilter(interaction.values[0]),
      page: 0,
    }));
    return;
  }

  if (action === 'open' && interaction.isStringSelectMenu()) {
    const payoutId = parseInt(interaction.values[0], 10);
    if (!Number.isFinite(payoutId)) {
      await interaction.editReply(await buildPayoutsListPayload(db, state));
      return;
    }
    await showPayout(db, interaction, state, payoutId);
    return;
  }

  if (action === 'nav') {
    const target = parseInt(value ?? '0', 10);
    await interaction.editReply(await buildPayoutsListPayload(db, {
      ...state,
      page: Number.isFinite(target) && target > 0 ? target : 0,
    }));
    return;
  }

  if (action === 'set') {
    const [nextStatus, idRaw] = (value ?? '').split('_');
    const payoutId = parseInt(idRaw ?? '', 10);
    const status = nextStatus === 'zrobione' || nextStatus === 'odrzucone'
      ? (nextStatus as PayoutStatus)
      : null;
    if (!status || !Number.isFinite(payoutId)) {
      await interaction.editReply(await buildPayoutsListPayload(db, state));
      return;
    }
    const changed = await db.setPayoutStatus(payoutId, status);
    await showPayout(db, interaction, state, payoutId);
    await interaction.followUp({
      embeds: [changed
        ? EmbedHelper.successEmbed('💸 Wypłaty', `Wpis **#${payoutId}** ma teraz status **${status}**.`)
        : EmbedHelper.warningEmbed('💸 Wypłaty', `Wpis **#${payoutId}** już miał status **${status}**.`)],
      flags: 64,
    }).catch(() => {});
    return;
  }

  // back / refresh / anything unexpected → current list
  await interaction.editReply(await buildPayoutsListPayload(db, state));
}
