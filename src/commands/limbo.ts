import { randomInt } from 'crypto';
import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { GAMES } from '../config/constants';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';

const MIN_BET = GAMES.limbo.minBet;
const MIN_TARGET = GAMES.limbo.minTarget;
const MAX_TARGET = GAMES.limbo.maxTarget;
const DEFAULT_TARGET = 2;

/** House edge ~4%. P(win) = (1 - HOUSE_EDGE) / target. RTP ≈ 96%. */
const HOUSE_EDGE = 0.04;
const RTP = 1 - HOUSE_EDGE;

/** customId encoding: target × 100, no decimal. `200` = 2.00x, `110` = 1.10x. */
const TARGET_SCALE = 100;

const ROLL_RANGE = 100_000_000;
const MAX_MULT = 1_000_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatMult(n: number): string {
  return `${n.toFixed(2)}x`;
}

function encodeTarget(target: number): number {
  return Math.round(target * TARGET_SCALE);
}

function normalizeTarget(raw: number): number {
  const rounded = Math.round(raw * TARGET_SCALE) / TARGET_SCALE;
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, rounded));
}

/**
 * Slash sends a real multiplier (1.10–100).
 * play_again extra is hundredths (`200` = 2.00x) so `parseInt` / customId stay
 * free of dots (`1.50` would become `1` via parseInt).
 */
function interpretTarget(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TARGET;
  if (raw > MAX_TARGET) return normalizeTarget(raw / TARGET_SCALE);
  return normalizeTarget(raw);
}

function readNamedNumber(interaction: ChatInputCommandInteraction, name: string): number | null {
  const options = interaction.options as ChatInputCommandInteraction['options'] & {
    getNumber?: (n: string) => number | null;
    getInteger?: (n: string) => number | null;
  };
  const fromNumber = options.getNumber?.(name);
  if (typeof fromNumber === 'number' && Number.isFinite(fromNumber)) return fromNumber;
  const fromInt = options.getInteger?.(name);
  if (typeof fromInt === 'number' && Number.isFinite(fromInt)) return fromInt;
  return null;
}

function resolveTarget(interaction: ChatInputCommandInteraction): number {
  const fromCel = readNamedNumber(interaction, 'cel');
  if (fromCel != null) return interpretTarget(fromCel);
  // Until the router maps `cel`, play_again extra is injected as getInteger('liczba').
  const fromExtra = readNamedNumber(interaction, 'liczba');
  if (fromExtra != null) return interpretTarget(fromExtra);
  return DEFAULT_TARGET;
}

/** Uniform (0, 1] via crypto.randomInt, then crash-style float: RTP / u. */
function rollMultiplier(): number {
  const bucket = randomInt(0, ROLL_RANGE);
  const u = (bucket + 1) / ROLL_RANGE;
  const raw = RTP / u;
  return Math.floor(Math.min(raw, MAX_MULT) * TARGET_SCALE) / TARGET_SCALE;
}

export default {
  data: new SlashCommandBuilder()
    .setName('limbo')
    .setDescription('🎯 Limbo — ustaw mnożnik. Wylosowany wynik musi go przebić.')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription(`Kwota do postawienia (min. $${MIN_BET.toLocaleString()})`)
        .setRequired(true)
        .setMinValue(MIN_BET),
    )
    .addNumberOption(option =>
      option
        .setName('cel')
        .setDescription(`Mnożnik docelowy (${MIN_TARGET.toFixed(2)}–${MAX_TARGET}, domyślnie ${DEFAULT_TARGET.toFixed(2)})`)
        .setRequired(false)
        .setMinValue(MIN_TARGET)
        .setMaxValue(MAX_TARGET),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
    const target = resolveTarget(interaction);
    const userId = interaction.user.id;

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające Środki',
        `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**`,
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    await interaction.deferReply();

    try {
      await client.db.updateMoney(userId, -bet);
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const embed = EmbedHelper.errorEmbed(
          '❌ Niewystarczające Środki',
          `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**`,
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      throw error;
    }

    const rolled = rollMultiplier();
    const won = rolled >= target;
    const payout = Math.floor(bet * target);

    await interaction.editReply({
      embeds: [pendingEmbed(
        'Limbo',
        pendingList(
          'Losowanie mnożnika...',
          [
            ['Zakład', formatUsd(bet)],
            ['Cel', formatMult(target)],
          ],
        ),
      )],
    });
    await sleep(450);

    await interaction.editReply({
      embeds: [pendingEmbed(
        'Limbo',
        pendingList(
          'Sprawdzam wynik...',
          [
            ['Zakład', formatUsd(bet)],
            ['Cel', formatMult(target)],
          ],
        ),
      )],
    });
    await sleep(400);

    if (won) {
      await client.db.updateMoney(userId, payout);
      await client.db.recordGame(userId, 'limbo', bet, payout, 'win');
      await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, wager: bet });
    } else {
      await client.db.recordGame(userId, 'limbo', bet, 0, 'loss');
      await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
    }

    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const extraParts: string[] = [];
    extraParts.push(
      won
        ? `Wypłata ${formatUsd(payout)} (stawka × cel)`
        : 'Cel nieosiągnięty — stawka przepadła.',
    );
    if (newAchievements.length > 0) {
      extraParts.push(`Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`);
    }

    const encodedTarget = encodeTarget(target);
    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:limbo:${bet}:${encodedTarget}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    });

    const embed = gameResultEmbed({
      title: 'Limbo',
      won,
      bet,
      result: `${formatMult(rolled)} vs ${formatMult(target)}`,
      balance: newData.money,
      extra: extraParts.join('\n'),
    });

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
