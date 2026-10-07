import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { randomUUID } from 'crypto';
import type { CasinoBot } from '../index';
import { COLORS, LIVE_CRASH, MAX_BET } from '../config/constants';
import { getGuildLang, getUserLang, t, type Lang } from '../i18n';
import { formatMultiplier, imageAttachment, renderCrashChart, safeRender, type CrashPlayerRow } from '../render';
import { InsufficientFundsError } from '../database/Database';
import { brandTitle, formatUsd } from './embeds';
import { EmbedHelper } from './helpers';
import { withUserLock } from './moneyLock';
import { runWithContext } from './requestContext';

/**
 * Crash Live: one shared round per channel. Anyone can join during the betting
 * window, everyone watches the same multiplier and cashes out on their own.
 *
 * Fairness: the crash point is fixed before the round starts and the payout
 * multiplier is computed from elapsed server time at the moment of the click,
 * never from the last rendered frame - so a cash-out that lands after the
 * crash moment is rejected even if the "crashed" frame has not been drawn yet.
 * Every stake is written to live_bets first, so a restart refunds open bets.
 */

interface LiveBet {
  userId: string;
  name: string;
  bet: number;
  settled: boolean;
  cashedAt?: number;
  payout?: number;
}

interface LiveRound {
  id: string;
  number: number;
  channelId: string;
  guildId: string | null;
  lang: Lang;
  message: Message | null;
  /**
   * Redraws go through the interaction webhook, not the channel API, so a
   * round works even where the bot lacks Embed Links / Attach Files. The token
   * lives 15 minutes - far longer than any round.
   */
  edit: ((payload: any) => Promise<unknown>) | null;
  state: 'betting' | 'running' | 'crashed';
  bets: Map<string, LiveBet>;
  crashPoint: number;
  bettingEndsAt: number;
  startedAt: number;
  history: number[];
}

const rounds = new Map<string, LiveRound>();
const roundsById = new Map<string, LiveRound>();

function generateCrashPoint(): number {
  const e = 2 ** 32;
  const h = Math.floor(Math.random() * e);
  if (h % 25 === 0) return 1.0;
  return Math.max(1.0, Math.floor((100 * e - h) / (e - h)) / 100);
}

function multiplierAt(round: LiveRound, now = Date.now()): number {
  const seconds = Math.max(0, (now - round.startedAt) / 1000);
  return Math.floor(Math.exp(LIVE_CRASH.growthRate * seconds) * 100) / 100;
}

function playerRows(round: LiveRound): CrashPlayerRow[] {
  return [...round.bets.values()].map(b => ({
    name: b.name,
    bet: b.bet,
    cashedAt: b.cashedAt,
    payout: b.payout,
  }));
}

function shortAmount(amount: number): string {
  return amount >= 1000 ? `$${amount / 1000}K` : `$${amount}`;
}

function components(round: LiveRound): ActionRowBuilder<ButtonBuilder>[] {
  const lang = round.lang;
  if (round.state === 'betting') {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const amount of LIVE_CRASH.quickBets) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`lc:bet:${round.id}:${amount}`)
          .setLabel(shortAmount(amount))
          .setStyle(ButtonStyle.Secondary),
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lc:custom:${round.id}`)
        .setLabel(t(lang, 'lc_btn_custom'))
        .setStyle(ButtonStyle.Primary),
    );
    return [row];
  }
  if (round.state === 'running') {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`lc:cash:${round.id}`)
        .setEmoji('💸')
        .setLabel(t(lang, 'lc_btn_cashout'))
        .setStyle(ButtonStyle.Success),
    )];
  }
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('lc:new')
      .setEmoji('🔁')
      .setLabel(t(lang, 'lc_btn_new'))
      .setStyle(ButtonStyle.Primary),
  )];
}

function describe(round: LiveRound): string {
  const lang = round.lang;
  if (round.state === 'betting') {
    const seconds = Math.max(0, Math.ceil((round.bettingEndsAt - Date.now()) / 1000));
    return t(lang, 'lc_desc_betting')(seconds, LIVE_CRASH.minBet);
  }
  if (round.state === 'running') return t(lang, 'lc_desc_running');
  const bets = [...round.bets.values()];
  const winners = bets.filter(b => b.cashedAt).length;
  return t(lang, 'lc_desc_crashed')(formatMultiplier(round.crashPoint), winners, bets.length - winners);
}

async function renderPayload(round: LiveRound) {
  const image = await safeRender('crash-live', () => renderCrashChart({
    state: round.state,
    history: round.history,
    multiplier: round.state === 'crashed' ? round.crashPoint : (round.history[round.history.length - 1] ?? 1),
    countdown: Math.max(0, (round.bettingEndsAt - Date.now()) / 1000),
    round: round.number,
    players: playerRows(round),
  }, round.lang));
  const color = round.state === 'crashed' ? COLORS.error : round.state === 'running' ? COLORS.gold : COLORS.info;
  const embed = new EmbedBuilder()
    .setTitle(brandTitle('Crash Live'))
    .setColor(color)
    .setDescription(describe(round));
  if (image) embed.setImage('attachment://crash.webp');
  return {
    embeds: [embed],
    components: components(round),
    files: image ? [imageAttachment(image, 'crash')] : [],
    attachments: [],
  };
}

async function redraw(round: LiveRound): Promise<void> {
  if (!round.edit) return;
  try {
    await round.edit(await renderPayload(round));
  } catch {
    // Message deleted or no access - the round still settles in the DB.
  }
}

async function nextRoundNumber(client: CasinoBot): Promise<number> {
  try {
    const current = Number(await client.db.getBotSetting('live_crash_round')) || 0;
    const next = current + 1;
    await client.db.setBotSetting('live_crash_round', String(next));
    return next;
  } catch {
    return Math.floor(Date.now() / 1000) % 100000;
  }
}

function displayName(interaction: ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction): string {
  const member = interaction.member as { displayName?: string; nick?: string | null } | null;
  return member?.displayName ?? member?.nick ?? interaction.user.globalName ?? interaction.user.username;
}

/** `/crash-live` and the "new round" button both land here. */
export async function startLiveRound(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  client: CasinoBot,
  openingBet: number | null,
): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  if (!interaction.inGuild() || !interaction.channelId) {
    await interaction.reply({ embeds: [EmbedHelper.errorEmbed('Crash Live', t(lang, 'lc_guild_only'))], flags: 64 });
    return;
  }
  const existing = rounds.get(interaction.channelId);
  if (existing) {
    const link = existing.message?.url ?? '';
    await interaction.reply({ embeds: [EmbedHelper.warningEmbed('Crash Live', t(lang, 'lc_already')(link))], flags: 64 });
    return;
  }

  const round: LiveRound = {
    id: randomUUID(),
    number: 0,
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    lang: await getGuildLang(client.db, interaction.guildId),
    message: null,
    edit: null,
    state: 'betting',
    bets: new Map(),
    crashPoint: generateCrashPoint(),
    bettingEndsAt: Date.now() + LIVE_CRASH.bettingMs,
    startedAt: 0,
    history: [1],
  };
  // Claim the channel before any await so two clicks cannot open two rounds.
  rounds.set(round.channelId, round);
  roundsById.set(round.id, round);

  try {
    round.number = await nextRoundNumber(client);
    if (openingBet != null) {
      const error = await placeBet(client, round, interaction.user.id, displayName(interaction), openingBet);
      if (error) {
        rounds.delete(round.channelId);
        roundsById.delete(round.id);
        await interaction.reply({ embeds: [EmbedHelper.errorEmbed('Crash Live', error(lang))], flags: 64 });
        return;
      }
    }
    await interaction.reply(await renderPayload(round));
    round.message = await interaction.fetchReply();
    round.edit = payload => interaction.editReply(payload);
  } catch (error) {
    rounds.delete(round.channelId);
    roundsById.delete(round.id);
    await refundAll(client, round);
    throw error;
  }

  // Two countdown redraws keep well inside the 5 edits / 5 s channel limit.
  setTimeout(() => { if (round.state === 'betting') void redraw(round); }, 5_000);
  setTimeout(() => { if (round.state === 'betting') void redraw(round); }, 10_000);
  setTimeout(() => { void beginRunning(client, round); }, LIVE_CRASH.bettingMs);
}

type ErrorText = (lang: Lang) => string;

async function placeBet(
  client: CasinoBot,
  round: LiveRound,
  userId: string,
  name: string,
  amount: number,
): Promise<ErrorText | null> {
  if (round.state !== 'betting') return lang => t(lang, 'lc_err_closed');
  if (round.bets.has(userId)) return lang => t(lang, 'lc_err_already_bet');
  if (round.bets.size >= LIVE_CRASH.maxPlayers) return lang => t(lang, 'lc_err_full');
  if (!Number.isInteger(amount) || amount < LIVE_CRASH.minBet) return lang => t(lang, 'min_bet')(LIVE_CRASH.minBet);
  if (amount > MAX_BET) return lang => t(lang, 'max_bet')(MAX_BET);
  if (await client.db.isMaintenance()) return lang => t(lang, 'maintenance');
  if (await client.db.isUserBlocked(userId)) return lang => t(lang, 'blocked')('');
  if (await client.db.isUserFrozen(userId)) return lang => t(lang, 'frozen');
  const limit = await client.db.getBetLimit(userId).catch(() => ({ maxBet: null as number | null, until: 0 }));
  if (limit.maxBet != null && amount > limit.maxBet) {
    return lang => t(lang, 'user_bet_limit')(limit.maxBet!, limit.until ? `<t:${Math.floor(limit.until / 1000)}:R>` : '-');
  }

  // Reserve the seat synchronously so a double click cannot charge twice.
  const seat: LiveBet = { userId, name, bet: amount, settled: false };
  round.bets.set(userId, seat);
  try {
    await withUserLock(userId, async () => {
      await client.db.updateMoney(userId, -amount);
      try {
        await client.db.insertLiveBet(round.id, userId, amount, round.guildId);
      } catch (error) {
        await client.db.updateMoney(userId, amount).catch(() => {});
        throw error;
      }
    });
  } catch (error) {
    round.bets.delete(userId);
    if (error instanceof InsufficientFundsError) {
      const has = (await client.db.getUser(userId)).money;
      return lang => t(lang, 'error_insufficient_funds')(amount, has);
    }
    console.error('[ROYALCASINO] Błąd zakładu crash-live:', error);
    return lang => t(lang, 'error_generic');
  }
  if (round.state !== 'betting') {
    // Betting closed while the stake was being written - give it back.
    round.bets.delete(userId);
    if (await client.db.settleLiveBet(round.id, userId, 'refunded', null, 0)) {
      await client.db.updateMoney(userId, amount).catch(() => {});
    }
    return lang => t(lang, 'lc_err_closed');
  }
  return null;
}

async function beginRunning(client: CasinoBot, round: LiveRound): Promise<void> {
  if (round.state !== 'betting') return;
  if (round.bets.size === 0) {
    round.state = 'crashed';
    rounds.delete(round.channelId);
    roundsById.delete(round.id);
    if (round.edit) {
      const embed = new EmbedBuilder()
        .setTitle(brandTitle('Crash Live'))
        .setColor(COLORS.dark)
        .setDescription(t(round.lang, 'lc_desc_empty'));
      await round.edit({ embeds: [embed], components: components(round), files: [], attachments: [] }).catch(() => {});
    }
    return;
  }
  round.state = 'running';
  round.startedAt = Date.now();
  round.history = [1];
  if (round.crashPoint <= 1.0) {
    await crash(client, round);
    return;
  }
  await redraw(round);
  scheduleTick(client, round);
}

function scheduleTick(client: CasinoBot, round: LiveRound): void {
  setTimeout(() => { void tick(client, round); }, LIVE_CRASH.tickMs);
}

async function tick(client: CasinoBot, round: LiveRound): Promise<void> {
  if (round.state !== 'running') return;
  const m = multiplierAt(round);
  if (m >= round.crashPoint) {
    await crash(client, round);
    return;
  }
  round.history.push(m);
  if ([...round.bets.values()].every(b => b.settled)) {
    // Everyone cashed out - finish the round at its real crash point anyway.
    await crash(client, round);
    return;
  }
  await redraw(round);
  scheduleTick(client, round);
}

async function crash(client: CasinoBot, round: LiveRound): Promise<void> {
  if (round.state === 'crashed') return;
  round.state = 'crashed';
  round.history.push(round.crashPoint);

  const losers = [...round.bets.values()].filter(b => !b.settled);
  for (const bet of losers) bet.settled = true;
  await runWithContext({ guildId: round.guildId, channelId: round.channelId }, async () => {
    for (const bet of losers) {
      try {
        if (await client.db.settleLiveBet(round.id, bet.userId, 'lost', null, 0)) {
          await client.db.recordGame(bet.userId, 'crash_live', bet.bet, 0, 'loss');
        }
      } catch (error) {
        console.error('[ROYALCASINO] Błąd rozliczenia crash-live:', error);
      }
    }
  });

  await redraw(round);
  rounds.delete(round.channelId);
  roundsById.delete(round.id);
}

async function refundAll(client: CasinoBot, round: LiveRound): Promise<void> {
  for (const bet of round.bets.values()) {
    if (bet.settled) continue;
    bet.settled = true;
    if (await client.db.settleLiveBet(round.id, bet.userId, 'refunded', null, 0).catch(() => false)) {
      await client.db.updateMoney(bet.userId, bet.bet).catch(() => {});
    }
  }
}

async function cashOut(interaction: ButtonInteraction, client: CasinoBot, round: LiveRound): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  const reply = (text: string, ok = false) => interaction.reply({
    embeds: [ok ? EmbedHelper.successEmbed('Crash Live', text) : EmbedHelper.warningEmbed('Crash Live', text)],
    flags: 64,
  });

  const bet = round.bets.get(interaction.user.id);
  if (!bet) return void await reply(t(lang, 'lc_err_no_bet'));
  if (bet.settled) return void await reply(t(lang, 'lc_err_settled'));
  if (round.state !== 'running') return void await reply(t(lang, 'lc_err_too_late'));

  // Decide synchronously against server time - no await between check and claim.
  const m = multiplierAt(round);
  if (m >= round.crashPoint) return void await reply(t(lang, 'lc_err_too_late'));
  bet.settled = true;
  bet.cashedAt = m;
  bet.payout = Math.floor(bet.bet * m);

  try {
    await runWithContext({ guildId: round.guildId, channelId: round.channelId }, () =>
      withUserLock(bet.userId, async () => {
        if (await client.db.settleLiveBet(round.id, bet.userId, 'paid', m, bet.payout!)) {
          await client.db.updateMoney(bet.userId, bet.payout!);
          await client.db.recordGame(bet.userId, 'crash_live', bet.bet, bet.payout!, 'win');
        }
      }));
  } catch (error) {
    console.error('[ROYALCASINO] Błąd wypłaty crash-live:', error);
  }
  await reply(t(lang, 'lc_cashed')(formatMultiplier(m), formatUsd(bet.payout)), true);
}

/** Router entry for every `lc:` button. */
export async function handleLiveCrashButton(interaction: ButtonInteraction, client: CasinoBot): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const lang = await getUserLang(client.db, interaction.user.id);

  if (action === 'new') {
    await startLiveRound(interaction, client, null);
    return;
  }

  const round = roundsById.get(parts[2]);
  if (!round) {
    await interaction.reply({ embeds: [EmbedHelper.warningEmbed('Crash Live', t(lang, 'lc_err_gone'))], flags: 64 });
    return;
  }

  if (action === 'cash') {
    await cashOut(interaction, client, round);
    return;
  }

  if (action === 'custom') {
    if (round.state !== 'betting') {
      await interaction.reply({ embeds: [EmbedHelper.warningEmbed('Crash Live', t(lang, 'lc_err_closed'))], flags: 64 });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`lc_modal:${round.id}`)
      .setTitle(t(lang, 'lc_modal_title'))
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(t(lang, 'lc_modal_label')(LIVE_CRASH.minBet))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('5000')
          .setRequired(true)
          .setMaxLength(12),
      ));
    await interaction.showModal(modal);
    return;
  }

  if (action === 'bet') {
    const amount = parseInt(parts[3], 10);
    await respondToBet(interaction, client, round, amount, lang);
  }
}

export async function handleLiveCrashModal(interaction: ModalSubmitInteraction, client: CasinoBot): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  const round = roundsById.get(interaction.customId.split(':')[1]);
  if (!round) {
    await interaction.reply({ embeds: [EmbedHelper.warningEmbed('Crash Live', t(lang, 'lc_err_gone'))], flags: 64 });
    return;
  }
  const raw = interaction.fields.getTextInputValue('amount').replace(/[\s_.,$]/g, '').toLowerCase();
  const multiplier = raw.endsWith('k') ? 1_000 : raw.endsWith('m') ? 1_000_000 : 1;
  const amount = Math.floor(Number(raw.replace(/[km]$/, '')) * multiplier);
  await respondToBet(interaction, client, round, amount, lang);
}

async function respondToBet(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  client: CasinoBot,
  round: LiveRound,
  amount: number,
  lang: Lang,
): Promise<void> {
  if (!Number.isFinite(amount)) {
    await interaction.reply({ embeds: [EmbedHelper.errorEmbed('Crash Live', t(lang, 'lc_err_amount'))], flags: 64 });
    return;
  }
  await interaction.deferReply({ flags: 64 });
  const error = await placeBet(client, round, interaction.user.id, displayName(interaction), amount);
  if (error) {
    await interaction.editReply({ embeds: [EmbedHelper.errorEmbed('Crash Live', error(lang))] });
    return;
  }
  await interaction.editReply({ embeds: [EmbedHelper.successEmbed('Crash Live', t(lang, 'lc_bet_ok')(formatUsd(amount)))] });
}

/** Startup: refund stakes from rounds that died with the previous process. */
export async function refundLiveCrashOnStartup(client: CasinoBot): Promise<void> {
  const refunded = await client.db.refundOpenLiveBets();
  if (refunded > 0) console.log(`♻️  [ROYALCASINO] Zwrócono ${refunded} zakładów z przerwanych rund Crash Live`);
}
