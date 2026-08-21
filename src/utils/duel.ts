import { randomBytes, randomInt } from 'crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { Database } from '../database/Database';
import { BRAND, COLORS } from '../config/constants';
import { getUserLang, t, type Lang } from '../i18n';
import { formatAchievementNamesInline } from './achievements';
import { withOwner } from './components';
import {
  asQuote,
  brandTitle,
  formatUsd,
  infoGameEmbed,
  listLine,
  pendingEmbed,
  pendingList,
  playAgainRow,
} from './embeds';
import { EmbedHelper, GameHelper } from './helpers';
import { withUserLocks } from './moneyLock';

/**
 * Custom IDs (wiring / router - collector handles these live):
 *
 *   duel:accept:<challengeId>:<owner=opponentId>:<ts>
 *   duel:decline:<challengeId>:<owner=opponentId>:<ts>
 *   duel:cancel:<challengeId>:<owner=challengerId>:<ts>
 *
 * Result (goes through interactionCreate, not the collector):
 *
 *   play_again:pojedynek:<bet>:<opponentId>:<challengerId>:<ts>
 *     both player ids are allowed (comma-owner check in the router)
 *   nav:balance:self:<challengerId>,<opponentId>:<ts>
 *
 * play_again extra (parts[3]) = original opponent. The router swaps the target
 * when the original opponent clicks rematch. If that customId exceeds
 * Discord's 100-char limit, rematch is omitted and only Saldo is shown.
 */
export const DUEL_PREFIX = 'duel:';
export const CHALLENGE_TIMEOUT_MS = 60_000;
export const DISCORD_CUSTOM_ID_MAX = 100;
export const GAME_TYPE = 'pojedynek';

export type DuelAction = 'accept' | 'decline' | 'cancel';
export type DuelStatus = 'pending' | 'settling' | 'resolved';
export type DuelButtonResult = 'continue' | 'stop';

export interface DuelClient {
  db: Database;
}

export interface DuelChallenge {
  id: string;
  challengerId: string;
  opponentId: string;
  bet: number;
  status: DuelStatus;
  createdAt: number;
}

interface SettleOk {
  ok: true;
  winnerId: string;
  loserId: string;
  pool: number;
  winnerBalance: number;
  challengerBalance: number;
  opponentBalance: number;
  winnerAchievements: string[];
  loserAchievements: string[];
}

interface SettleShort {
  ok: false;
  reason: 'insufficient';
  short: Array<{ userId: string; money: number }>;
}

type SettleResult = SettleOk | SettleShort;

const challenges = new Map<string, DuelChallenge>();
const userChallenge = new Map<string, string>();
const lastOpponent = new Map<string, string>();
const recentlyResolved = new Set<string>();
const handledInteractions = new WeakSet<ButtonInteraction>();

function newChallengeId(): string {
  return randomBytes(6).toString('hex');
}

function isBusyStatus(status: DuelStatus): boolean {
  return status === 'pending' || status === 'settling';
}

function unlinkUsers(challenge: DuelChallenge): void {
  if (userChallenge.get(challenge.challengerId) === challenge.id) {
    userChallenge.delete(challenge.challengerId);
  }
  if (userChallenge.get(challenge.opponentId) === challenge.id) {
    userChallenge.delete(challenge.opponentId);
  }
}

function dropChallenge(challenge: DuelChallenge): void {
  unlinkUsers(challenge);
  challenges.delete(challenge.id);
}

function sweepStale(challenge: DuelChallenge): DuelChallenge | undefined {
  if (challenge.status === 'resolved') {
    dropChallenge(challenge);
    return undefined;
  }
  if (
    challenge.status === 'pending' &&
    Date.now() - challenge.createdAt > CHALLENGE_TIMEOUT_MS + 10_000
  ) {
    dropChallenge(challenge);
    return undefined;
  }
  return challenge;
}

export function getChallenge(id: string): DuelChallenge | undefined {
  const challenge = challenges.get(id);
  if (!challenge) return undefined;
  return sweepStale(challenge);
}

export function getActiveChallenge(userId: string): DuelChallenge | undefined {
  const id = userChallenge.get(userId);
  if (!id) return undefined;
  const challenge = getChallenge(id);
  if (!challenge || !isBusyStatus(challenge.status)) {
    if (userChallenge.get(userId) === id) userChallenge.delete(userId);
    return undefined;
  }
  return challenge;
}

export function isUserInDuel(userId: string): boolean {
  return getActiveChallenge(userId) !== undefined;
}

export function getLastOpponent(userId: string): string | undefined {
  return lastOpponent.get(userId);
}

export function rememberOpponent(challengerId: string, opponentId: string): void {
  lastOpponent.set(challengerId, opponentId);
}

export async function createChallenge(params: {
  challengerId: string;
  opponentId: string;
  bet: number;
}): Promise<DuelChallenge | null> {
  return withUserLocks([params.challengerId, params.opponentId], () => {
    if (isUserInDuel(params.challengerId) || isUserInDuel(params.opponentId)) {
      return null;
    }

    const challenge: DuelChallenge = {
      id: newChallengeId(),
      challengerId: params.challengerId,
      opponentId: params.opponentId,
      bet: params.bet,
      status: 'pending',
      createdAt: Date.now(),
    };

    challenges.set(challenge.id, challenge);
    userChallenge.set(challenge.challengerId, challenge.id);
    userChallenge.set(challenge.opponentId, challenge.id);
    rememberOpponent(params.challengerId, params.opponentId);
    return challenge;
  });
}

/** Returns true when this challenge was still pending and is now expired. */
export function expireIfPending(challengeId: string): boolean {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== 'pending') return false;
  challenge.status = 'resolved';
  recentlyResolved.add(challenge.id);
  dropChallenge(challenge);
  setTimeout(() => recentlyResolved.delete(challenge.id), 30_000);
  return true;
}

export function parseDuelCustomId(
  customId: string,
): { action: DuelAction; challengeId: string } | null {
  if (!customId.startsWith(DUEL_PREFIX)) return null;
  const parts = customId.split(':');
  const action = parts[1] as DuelAction;
  const challengeId = parts[2];
  if (
    (action !== 'accept' && action !== 'decline' && action !== 'cancel') ||
    !challengeId
  ) {
    return null;
  }
  return { action, challengeId };
}

export function buildChallengeButtons(
  challenge: DuelChallenge,
  lang: Lang = 'pl',
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withOwner(`${DUEL_PREFIX}accept:${challenge.id}`, challenge.opponentId))
      .setLabel(t(lang, 'duel_btn_accept'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(withOwner(`${DUEL_PREFIX}decline:${challenge.id}`, challenge.opponentId))
      .setLabel(t(lang, 'duel_btn_decline'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(withOwner(`${DUEL_PREFIX}cancel:${challenge.id}`, challenge.challengerId))
      .setLabel(t(lang, 'duel_btn_cancel'))
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildDuelResultRow(params: {
  challengerId: string;
  opponentId: string;
  bet: number;
  lang?: Lang;
}): ActionRowBuilder<ButtonBuilder> {
  const lang = params.lang ?? 'pl';
  const ts = Date.now();
  const owners = `${params.challengerId},${params.opponentId}`;
  const playAgainId = `play_again:pojedynek:${params.bet}:${params.opponentId}:${params.challengerId}:${ts}`;
  const balanceId = `nav:balance:self:${owners}:${ts}`;

  if (playAgainId.length <= DISCORD_CUSTOM_ID_MAX) {
    return playAgainRow({
      customIdPlayAgain: playAgainId,
      customIdBalance: balanceId,
      playAgainLabel: t(lang, 'duel_btn_rematch'),
      balanceLabel: t(lang, 'duel_btn_balance'),
    });
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(balanceId)
      .setLabel(t(lang, 'duel_btn_balance'))
      .setStyle(ButtonStyle.Secondary),
  );
}

export function pendingDescription(
  challenge: DuelChallenge,
  expiresAtSec: number,
  lang: Lang = 'pl',
): string {
  const pool = challenge.bet * 2;
  return pendingList(
    t(lang, 'duel_challenge_intro')(`<@${challenge.challengerId}>`, `<@${challenge.opponentId}>`),
    [
      [t(lang, 'duel_stake'), formatUsd(challenge.bet)],
      [t(lang, 'duel_pool'), formatUsd(pool)],
    ],
    `${t(lang, 'duel_expires')(expiresAtSec)}\n${t(lang, 'duel_pending_tip')}`,
  );
}

function isIgnorableInteractionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: number | string }).code;
  return code === 10062 || code === 'InteractionAlreadyReplied';
}

async function ackUpdate(
  interaction: ButtonInteraction,
  payload: { content?: string; embeds: any[]; components: any[] },
): Promise<void> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.update(payload);
    }
  } catch (error) {
    if (isIgnorableInteractionError(error)) {
      await interaction.message.edit(payload).catch(() => {});
      return;
    }
    throw error;
  }
}

async function ephemeralNotice(
  interaction: ButtonInteraction,
  title: string,
  description: string,
): Promise<void> {
  if (interaction.replied || interaction.deferred) return;
  try {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(title, description)],
      flags: 64,
    });
  } catch (error) {
    if (isIgnorableInteractionError(error)) return;
    throw error;
  }
}

async function refundBets(db: Database, userIds: string[], bet: number): Promise<void> {
  for (const id of [...userIds].reverse()) {
    await db.updateMoney(id, bet).catch(() => {});
  }
}

async function settleDuel(client: DuelClient, challenge: DuelChallenge): Promise<SettleResult> {
  const { challengerId, opponentId, bet } = challenge;
  const pool = bet * 2;

  return withUserLocks([challengerId, opponentId], async () => {
    const [challenger, opponent] = await Promise.all([
      client.db.getUser(challengerId),
      client.db.getUser(opponentId),
    ]);

    const short: Array<{ userId: string; money: number }> = [];
    if (!GameHelper.canAfford(challenger.money, bet)) {
      short.push({ userId: challengerId, money: challenger.money });
    }
    if (!GameHelper.canAfford(opponent.money, bet)) {
      short.push({ userId: opponentId, money: opponent.money });
    }
    if (short.length > 0) {
      return { ok: false, reason: 'insufficient', short };
    }

    const debitOrder = [challengerId, opponentId].sort();
    const deducted: string[] = [];
    let winnerId: string;
    let loserId: string;

    try {
      for (const id of debitOrder) {
        await client.db.updateMoney(id, -bet);
        deducted.push(id);
      }

      winnerId = randomInt(2) === 0 ? challengerId : opponentId;
      loserId = winnerId === challengerId ? opponentId : challengerId;
      await client.db.updateMoney(winnerId, pool);
    } catch (error) {
      await refundBets(client.db, deducted, bet);
      throw error;
    }

    await client.db.recordGame(winnerId, GAME_TYPE, bet, pool, 'win');
    await client.db.recordGame(loserId, GAME_TYPE, bet, 0, 'loss');
    await client.db.updateQuestProgress(winnerId, {
      win_games: 1,
      play_games: 1,
      wager: bet,
    });
    await client.db.updateQuestProgress(loserId, { play_games: 1, wager: bet });

    const [winnerAchievements, loserAchievements, challengerData, opponentData] = await Promise.all([
      client.db.checkAchievements(winnerId),
      client.db.checkAchievements(loserId),
      client.db.getUser(challengerId),
      client.db.getUser(opponentId),
    ]);

    return {
      ok: true,
      winnerId,
      loserId,
      pool,
      winnerBalance: winnerId === challengerId ? challengerData.money : opponentData.money,
      challengerBalance: challengerData.money,
      opponentBalance: opponentData.money,
      winnerAchievements,
      loserAchievements,
    };
  });
}

async function displayName(interaction: ButtonInteraction, userId: string): Promise<string> {
  if (interaction.user.id === userId) return interaction.user.username;
  const cached = interaction.client.users.cache.get(userId);
  if (cached) return cached.username;
  const fetched = await interaction.client.users.fetch(userId).catch(() => null);
  return fetched?.username ?? userId;
}

function duelResultEmbed(params: {
  lang: Lang;
  winnerName: string;
  loserName: string;
  pool: number;
  bet: number;
  winnerBalance: number;
  loserBalance: number;
  winnerAchievements: string[];
  loserAchievements: string[];
}): EmbedBuilder {
  const { lang } = params;
  const lines = [
    t(lang, 'duel_win_sentence')(params.winnerName, formatUsd(params.pool)),
    '',
    listLine(t(lang, 'label_bet'), formatUsd(params.bet)),
    listLine(t(lang, 'duel_winner_balance'), formatUsd(params.winnerBalance)),
    listLine(t(lang, 'duel_opponent_balance'), formatUsd(params.loserBalance)),
  ];

  const extra: string[] = [];
  if (params.winnerAchievements.length > 0) {
    extra.push(`${params.winnerName} - ${formatAchievementNamesInline(params.winnerAchievements)}`);
  }
  if (params.loserAchievements.length > 0) {
    extra.push(`${params.loserName} - ${formatAchievementNamesInline(params.loserAchievements)}`);
  }
  if (extra.length > 0) {
    lines.push('', asQuote(extra.join('\n')));
  }

  return new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'duel_title')))
    .setColor(COLORS.success)
    .setDescription(lines.join('\n'))
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

function finishChallenge(challenge: DuelChallenge): void {
  challenge.status = 'resolved';
  recentlyResolved.add(challenge.id);
  dropChallenge(challenge);
  setTimeout(() => recentlyResolved.delete(challenge.id), 30_000);
}

/**
 * Shared button handler for the in-command collector and (optionally) a
 * `duel:` router after a restart. Safe to call twice for the same interaction.
 */
export async function handleDuelButton(
  interaction: ButtonInteraction,
  client: DuelClient,
): Promise<DuelButtonResult> {
  if (handledInteractions.has(interaction)) return 'continue';
  handledInteractions.add(interaction);

  const parsed = parseDuelCustomId(interaction.customId);
  if (!parsed) return 'continue';

  const clickerLang = await getUserLang(client.db, interaction.user.id);
  const challenge = getChallenge(parsed.challengeId);
  if (!challenge) {
    if (recentlyResolved.has(parsed.challengeId) || interaction.replied || interaction.deferred) {
      await ephemeralNotice(
        interaction,
        t(clickerLang, 'duel_already_done_title'),
        t(clickerLang, 'duel_already_done'),
      );
      return 'stop';
    }
    await ackUpdate(interaction, {
      content: t(clickerLang, 'duel_expired_content'),
      embeds: [infoGameEmbed(t(clickerLang, 'duel_title'), t(clickerLang, 'duel_expired_desc'))],
      components: [],
    });
    return 'stop';
  }

  const publicLang = await getUserLang(client.db, challenge.challengerId);
  const clicker = interaction.user.id;
  const title = t(publicLang, 'duel_title');

  if (parsed.action === 'cancel') {
    if (clicker !== challenge.challengerId) {
      await ephemeralNotice(
        interaction,
        t(clickerLang, 'duel_not_your_button_title'),
        t(clickerLang, 'duel_not_your_cancel'),
      );
      return 'continue';
    }
    if (challenge.status !== 'pending') {
      await ephemeralNotice(
        interaction,
        t(clickerLang, 'duel_too_late_title'),
        t(clickerLang, 'duel_too_late'),
      );
      return 'continue';
    }
    finishChallenge(challenge);
    await ackUpdate(interaction, {
      content: t(publicLang, 'duel_cancelled_content'),
      embeds: [infoGameEmbed(title, t(publicLang, 'duel_cancelled_desc'))],
      components: [],
    });
    return 'stop';
  }

  if (parsed.action === 'decline') {
    if (clicker !== challenge.opponentId) {
      await ephemeralNotice(
        interaction,
        t(clickerLang, 'duel_not_your_button_title'),
        t(clickerLang, 'duel_not_your_respond'),
      );
      return 'continue';
    }
    if (challenge.status !== 'pending') {
      await ephemeralNotice(
        interaction,
        t(clickerLang, 'duel_too_late_title'),
        t(clickerLang, 'duel_too_late'),
      );
      return 'continue';
    }
    finishChallenge(challenge);
    await ackUpdate(interaction, {
      content: t(publicLang, 'duel_declined_content'),
      embeds: [infoGameEmbed(title, t(publicLang, 'duel_declined_desc'))],
      components: [],
    });
    return 'stop';
  }

  // accept
  if (clicker !== challenge.opponentId) {
    await ephemeralNotice(
      interaction,
      t(clickerLang, 'duel_not_your_button_title'),
      t(clickerLang, 'duel_not_your_respond'),
    );
    return 'continue';
  }

  if (challenge.status === 'settling' || challenge.status === 'resolved') {
    await ephemeralNotice(
      interaction,
      t(clickerLang, 'duel_already_done_title'),
      t(clickerLang, 'duel_already_accepted'),
    );
    return challenge.status === 'resolved' ? 'stop' : 'continue';
  }

  challenge.status = 'settling';

  await ackUpdate(interaction, {
    content: t(publicLang, 'duel_rolling_content'),
    embeds: [pendingEmbed(title, pendingList(t(publicLang, 'duel_rolling_desc')))],
    components: [],
  });

  try {
    const result = await settleDuel(client, challenge);

    if (!result.ok) {
      finishChallenge(challenge);
      const lines = result.short.map(s =>
        t(publicLang, 'duel_short_line')(`<@${s.userId}>`, s.money, challenge.bet),
      );
      await ackUpdate(interaction, {
        content: t(publicLang, 'duel_no_funds_content'),
        embeds: [infoGameEmbed(title, t(publicLang, 'duel_no_funds')(lines.join('\n')))],
        components: [],
      });
      return 'stop';
    }

    finishChallenge(challenge);

    const [winnerName, loserName] = await Promise.all([
      displayName(interaction, result.winnerId),
      displayName(interaction, result.loserId),
    ]);
    const loserBalance = result.loserId === challenge.challengerId
      ? result.challengerBalance
      : result.opponentBalance;

    const embed = duelResultEmbed({
      lang: publicLang,
      winnerName,
      loserName,
      pool: result.pool,
      bet: challenge.bet,
      winnerBalance: result.winnerBalance,
      loserBalance,
      winnerAchievements: result.winnerAchievements,
      loserAchievements: result.loserAchievements,
    });

    await ackUpdate(interaction, {
      content: t(publicLang, 'duel_win_content')(result.winnerId),
      embeds: [embed],
      components: [buildDuelResultRow({
        challengerId: challenge.challengerId,
        opponentId: challenge.opponentId,
        bet: challenge.bet,
        lang: publicLang,
      })],
    });
    return 'stop';
  } catch (error) {
    finishChallenge(challenge);
    if (!isIgnorableInteractionError(error)) {
      console.error('[ROYALCASINO] Pojedynek settle error:', error);
    }
    await ackUpdate(interaction, {
      content: t(publicLang, 'duel_error_content'),
      embeds: [infoGameEmbed(title, t(publicLang, 'duel_error_settle'))],
      components: [],
    }).catch(() => {});
    return 'stop';
  }
}
