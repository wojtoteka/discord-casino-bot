import { randomBytes, randomInt } from 'crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
} from 'discord.js';
import { Database } from '../database/Database';
import { formatAchievementNamesInline } from './achievements';
import { withOwner } from './components';
import {
  formatUsd,
  gameResultEmbed,
  infoGameEmbed,
  pendingEmbed,
  pendingList,
  playAgainRow,
} from './embeds';
import { EmbedHelper, GameHelper } from './helpers';
import { withUserLocks } from './moneyLock';

/**
 * Custom IDs (wiring / router — collector handles these live):
 *
 *   duel:accept:<challengeId>:<owner=opponentId>:<ts>
 *   duel:decline:<challengeId>:<owner=opponentId>:<ts>
 *   duel:cancel:<challengeId>:<owner=challengerId>:<ts>
 *
 * Result (goes through interactionCreate, not the collector):
 *
 *   play_again:pojedynek:<bet>:<opponentId>:<owner=challengerId>:<ts>
 *   nav:balance:<challengerId>:<owner=challengerId>:<ts>
 *
 * play_again extra (parts[3]) = opponent snowflake. If that customId exceeds
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

export function createChallenge(params: {
  challengerId: string;
  opponentId: string;
  bet: number;
}): DuelChallenge | null {
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

export function buildChallengeButtons(challenge: DuelChallenge): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withOwner(`${DUEL_PREFIX}accept:${challenge.id}`, challenge.opponentId))
      .setLabel('✅ Przyjmij')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(withOwner(`${DUEL_PREFIX}decline:${challenge.id}`, challenge.opponentId))
      .setLabel('❌ Odrzuć')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(withOwner(`${DUEL_PREFIX}cancel:${challenge.id}`, challenge.challengerId))
      .setLabel('🚫 Anuluj')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildDuelResultRow(params: {
  challengerId: string;
  opponentId: string;
  bet: number;
}): ActionRowBuilder<ButtonBuilder> {
  const balanceId = withOwner(`nav:balance:${params.challengerId}`, params.challengerId);
  const playAgainId = withOwner(
    `play_again:pojedynek:${params.bet}:${params.opponentId}`,
    params.challengerId,
  );

  if (playAgainId.length <= DISCORD_CUSTOM_ID_MAX) {
    return playAgainRow({
      customIdPlayAgain: playAgainId,
      customIdBalance: balanceId,
      playAgainLabel: '⚔️ Rewanż',
      balanceLabel: '💰 Saldo',
    });
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(balanceId)
      .setLabel('💰 Saldo')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function pendingDescription(challenge: DuelChallenge, expiresAtSec: number): string {
  const pool = challenge.bet * 2;
  return pendingList(
    `<@${challenge.challengerId}> rzuca wyzwanie <@${challenge.opponentId}>.`,
    [
      ['Stawka', formatUsd(challenge.bet)],
      ['Pula', formatUsd(pool)],
    ],
    `Wygasa <t:${expiresAtSec}:R>. Nic nie schodzi z konta przed akceptacją.\nWyzwany: **Przyjmij** albo **Odrzuć**. Wzywający może **Anulować**.`,
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

function extraLines(result: SettleOk): string | undefined {
  const lines: string[] = [
    `<@${result.loserId}> przegrywa stawkę.`,
    `Wzywający: **${formatUsd(result.challengerBalance)}** · Wyzwany: **${formatUsd(result.opponentBalance)}**`,
  ];

  if (result.winnerAchievements.length > 0) {
    lines.push(`<@${result.winnerId}> — ${formatAchievementNamesInline(result.winnerAchievements)}`);
  }
  if (result.loserAchievements.length > 0) {
    lines.push(`<@${result.loserId}> — ${formatAchievementNamesInline(result.loserAchievements)}`);
  }

  return lines.join('\n');
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

  const challenge = getChallenge(parsed.challengeId);
  if (!challenge) {
    if (recentlyResolved.has(parsed.challengeId) || interaction.replied || interaction.deferred) {
      await ephemeralNotice(interaction, '✅ Już zakończone', 'To wyzwanie jest już rozstrzygnięte.');
      return 'stop';
    }
    await ackUpdate(interaction, {
      content: '⏳ Wyzwanie wygasło.',
      embeds: [infoGameEmbed('Pojedynek', 'To wyzwanie wygasło. Nic nie zostało pobrane.')],
      components: [],
    });
    return 'stop';
  }

  const clicker = interaction.user.id;

  if (parsed.action === 'cancel') {
    if (clicker !== challenge.challengerId) {
      await ephemeralNotice(
        interaction,
        '⛔ Nie Twój przycisk',
        'Anulować może tylko osoba, która wysłała wyzwanie.',
      );
      return 'continue';
    }
    if (challenge.status !== 'pending') {
      await ephemeralNotice(interaction, '⚠️ Za późno', 'To wyzwanie jest już rozstrzygane albo zakończone.');
      return 'continue';
    }
    finishChallenge(challenge);
    await ackUpdate(interaction, {
      content: '🚫 Wyzwanie anulowane.',
      embeds: [infoGameEmbed('Pojedynek', 'Wzywający anulował pojedynek. Nic nie zostało pobrane.')],
      components: [],
    });
    return 'stop';
  }

  if (parsed.action === 'decline') {
    if (clicker !== challenge.opponentId) {
      await ephemeralNotice(
        interaction,
        '⛔ Nie Twój przycisk',
        'Przyjąć albo odrzucić może tylko wyzwany gracz.',
      );
      return 'continue';
    }
    if (challenge.status !== 'pending') {
      await ephemeralNotice(interaction, '⚠️ Za późno', 'To wyzwanie jest już rozstrzygane albo zakończone.');
      return 'continue';
    }
    finishChallenge(challenge);
    await ackUpdate(interaction, {
      content: '❌ Wyzwanie odrzucone.',
      embeds: [infoGameEmbed('Pojedynek', 'Wyzwany odrzucił pojedynek. Nic nie zostało pobrane.')],
      components: [],
    });
    return 'stop';
  }

  // accept
  if (clicker !== challenge.opponentId) {
    await ephemeralNotice(
      interaction,
      '⛔ Nie Twój przycisk',
      'Przyjąć albo odrzucić może tylko wyzwany gracz.',
    );
    return 'continue';
  }

  if (challenge.status === 'settling' || challenge.status === 'resolved') {
    await ephemeralNotice(interaction, '✅ Już przyjęte', 'To wyzwanie jest już obsłużone.');
    return challenge.status === 'resolved' ? 'stop' : 'continue';
  }

  challenge.status = 'settling';

  await ackUpdate(interaction, {
    content: '🪙 Losowanie zwycięzcy…',
    embeds: [pendingEmbed('Pojedynek', pendingList('Losowanie zwycięzcy — uczciwe 50/50, bez prowizji kasyna.'))],
    components: [],
  });

  try {
    const result = await settleDuel(client, challenge);

    if (!result.ok) {
      finishChallenge(challenge);
      const lines = result.short.map(
        s => `<@${s.userId}> ma **$${s.money.toLocaleString()}**, potrzeba **$${challenge.bet.toLocaleString()}**.`,
      );
      await ackUpdate(interaction, {
        content: '❌ Brak środków.',
        embeds: [infoGameEmbed(
          'Pojedynek',
          `Nie udało się przyjąć pojedynku — brak kasy.\n${lines.join('\n')}\n\nNic nie zostało pobrane.`,
        )],
        components: [],
      });
      return 'stop';
    }

    finishChallenge(challenge);

    const embed = gameResultEmbed({
      title: 'Pojedynek',
      won: true,
      bet: challenge.bet,
      result: `<@${result.winnerId}> wygrywa pulę ${formatUsd(result.pool)}`,
      balance: result.winnerBalance,
      extra: extraLines(result),
    });

    await ackUpdate(interaction, {
      content: `🏆 <@${result.winnerId}> wygrywa pojedynek!`,
      embeds: [embed],
      components: [buildDuelResultRow({
        challengerId: challenge.challengerId,
        opponentId: challenge.opponentId,
        bet: challenge.bet,
      })],
    });
    return 'stop';
  } catch (error) {
    finishChallenge(challenge);
    if (!isIgnorableInteractionError(error)) {
      console.error('[ROYALCASINO] Pojedynek settle error:', error);
    }
    await ackUpdate(interaction, {
      content: '❌ Błąd pojedynku.',
      embeds: [infoGameEmbed('Pojedynek', 'Coś poszło nie tak przy rozliczeniu. Jeśli stawka zeszła z konta, spróbuj skontaktować się z administracją.')],
      components: [],
    }).catch(() => {});
    return 'stop';
  }
}
