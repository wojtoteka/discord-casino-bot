import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

const MIN_BET = 100;

const PRIZES = [
  { sym: '7️⃣', mult: 25, p: 0.002, label: '7️⃣ x3' },
  { sym: '👑', mult: 10, p: 0.013, label: '👑 x3' },
  { sym: '💎', mult: 5,  p: 0.035, label: '💎 x3' },
  { sym: '💵', mult: 3,  p: 0.07,  label: '💵 x3' },
  { sym: '🍀', mult: 2,  p: 0.18,  label: '🍀 x3' },
];

const FILLER = ['🍀', '💵', '💎', '👑', '7️⃣', '🍋', '🔔', '🍒'];
const COVER = '❔';

function rollOutcome(): { sym: string; mult: number } | null {
  const r = Math.random();
  let acc = 0;
  for (const prize of PRIZES) {
    acc += prize.p;
    if (r < acc) return { sym: prize.sym, mult: prize.mult };
  }
  return null;
}

function losingTriple(): [string, string, string] {
  const pick = () => GameHelper.getRandomChoice(FILLER);
  let a = pick(), b = pick(), c = pick();
  while (a === b && b === c) c = pick();
  return [a, b, c];
}

function renderCard(cells: string[]): string {
  return `${cells[0]} × ${cells[1]} × ${cells[2]}`;
}

function zdrapkaAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:zdrapka:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('zdrapka')
    .setDescription('🎟️ Zdrap 3 pola - trzy takie same symbole = wygrana!')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Kwota do postawienia (min. $100)')
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
        '❌ Niewystarczające środki',
        `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**`,
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    await interaction.deferReply();

    const outcome = rollOutcome();
    const finalCells: string[] = outcome
      ? [outcome.sym, outcome.sym, outcome.sym]
      : losingTriple();

    const cells = [COVER, COVER, COVER];
    await interaction.editReply({
      embeds: [pendingEmbed('Zdrapka', pendingList('Zdrapuję pola...', [['Zakład', formatUsd(bet)]], renderCard(cells)))],
    });

    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 650));
      cells[i] = finalCells[i];
      await interaction.editReply({
        embeds: [pendingEmbed(
          'Zdrapka',
          pendingList(
            i < 2 ? 'Zdrapuję pola...' : 'Sprawdzam wynik...',
            [['Zakład', formatUsd(bet)]],
            renderCard(cells),
          ),
        )],
      });
    }

    await new Promise(r => setTimeout(r, 400));

    const row = zdrapkaAgainRow(bet, userId);

    if (outcome) {
      const winnings = Math.floor(bet * outcome.mult);
      const profit = winnings - bet;
      await client.db.updateMoney(userId, profit);
      await client.db.recordGame(userId, 'zdrapka', bet, winnings, 'win');
      await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, play_zdrapka: 1, wager: bet });
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      let extra = `Trzy ${outcome.sym} · **${outcome.mult}x**`;
      if (newAchievements.length > 0) {
        extra += `\nNowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
      }

      const embed = gameResultEmbed({
        title: outcome.mult >= 25 ? 'Zdrapka · Jackpot' : 'Zdrapka',
        won: true,
        bet,
        result: `${renderCard(finalCells)} · +$${profit.toLocaleString()}`,
        balance: newData.money,
        extra,
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await client.db.updateMoney(userId, -bet);
      await client.db.recordGame(userId, 'zdrapka', bet, 0, 'loss');
      await client.db.updateQuestProgress(userId, { play_games: 1, play_zdrapka: 1, wager: bet });
      await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      const embed = gameResultEmbed({
        title: 'Zdrapka',
        won: false,
        bet,
        result: `${renderCard(finalCells)} · -$${bet.toLocaleString()}`,
        balance: newData.money,
        extra: 'Brak trzech takich samych symboli.',
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  },
};
