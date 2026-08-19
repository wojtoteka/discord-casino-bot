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

const MIN_BET = (GAMES as { plinko?: { minBet?: number } }).plinko?.minBet ?? 100;
const ROWS = 8;

// 8-row Galton board: bucket k (k right-bounces) has P = C(8,k) / 256.
// C(8,k) = 1, 8, 28, 56, 70, 56, 28, 8, 1
// Multipliers (k = 0..8, edges high / center low):
//   20×  4×  1.4×  0.4×  0.2×  0.4×  1.4×  4×  20×
// EV = (1·20 + 8·4 + 28·1.4 + 56·0.4 + 70·0.2 + 56·0.4 + 28·1.4 + 8·4 + 1·20) / 256
//    = 241.2 / 256 = 0.9422  →  RTP 94.22%, house edge ~5.8%
const MULTIPLIERS = [20, 4, 1.4, 0.4, 0.2, 0.4, 1.4, 4, 20] as const;

type Step = { pos: number; dir: 'left' | 'right' };

function dropBall(): { steps: Step[]; bucket: number } {
  const steps: Step[] = [];
  let pos = 0;
  for (let i = 0; i < ROWS; i++) {
    const goRight = randomInt(2) === 1;
    if (goRight) pos += 1;
    steps.push({ pos, dir: goRight ? 'right' : 'left' });
  }
  return { steps, bucket: pos };
}

function formatMult(mult: number): string {
  return `${mult}×`;
}

function dropFrame(bet: number, row: number, step: Step): string {
  const width = row + 2;
  const cells = Array.from({ length: width }, (_, i) => (i === step.pos ? '🔴' : '🔹'));
  const arrow = step.dir === 'right' ? '↘️' : '↙️';
  return pendingList(
    `${arrow} Piłka spada.`,
    [
      ['Zakład', formatUsd(bet)],
      ['Rząd', `${row + 1}/${ROWS}`],
    ],
    cells.join(' '),
  );
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export default {
  data: new SlashCommandBuilder()
    .setName('plinko')
    .setDescription('🔴 Plinko — puść piłkę przez 8 rzędów kołków!')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription(`Kwota do postawienia (min. $${MIN_BET.toLocaleString()})`)
        .setRequired(true)
        .setMinValue(MIN_BET),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
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

    const { steps, bucket } = dropBall();
    const mult = MULTIPLIERS[bucket];
    const winnings = Math.floor(bet * mult);

    for (let i = 0; i < ROWS; i++) {
      const embed = pendingEmbed('Plinko', dropFrame(bet, i, steps[i]));
      await interaction.editReply({ embeds: [embed] });
      await sleep(180 + i * 40);
    }

    await sleep(280);

    await client.db.updateMoney(userId, winnings);

    const isWin = winnings > bet;
    const outcome: 'win' | 'loss' = isWin ? 'win' : 'loss';

    await client.db.recordGame(userId, 'plinko', bet, winnings, outcome);
    await client.db.updateQuestProgress(userId, {
      play_games: 1,
      wager: bet,
      ...(isWin ? { win_games: 1 } : {}),
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const result = `Kubełek ${formatMult(mult)}`;
    const extra = newAchievements.length > 0
      ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
      : undefined;

    const embed = gameResultEmbed({
      title: 'Plinko',
      won: isWin,
      bet,
      result,
      balance: newData.money,
      extra,
    });

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:plinko:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    });

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
