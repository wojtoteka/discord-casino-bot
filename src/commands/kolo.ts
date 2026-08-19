import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { formatUsd, gameResultEmbed, infoGameEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

const MIN_BET = 100;

const SEGMENTS = [
  { mult: 0,   p: 0.42, emoji: '💀', label: 'Pusto'        },
  { mult: 0.5, p: 0.28, emoji: '🥉', label: '0.5x'         },
  { mult: 1,   p: 0.14, emoji: '🔄', label: '1x (zwrot)'   },
  { mult: 2,   p: 0.09, emoji: '🥈', label: '2x'           },
  { mult: 5,   p: 0.05, emoji: '🥇', label: '5x'           },
  { mult: 10,  p: 0.02, emoji: '👑', label: '10x'          },
];

function spinWheel() {
  const r = Math.random();
  let acc = 0;
  for (const seg of SEGMENTS) {
    acc += seg.p;
    if (r < acc) return seg;
  }
  return SEGMENTS[0];
}

function koloAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:kolo:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('kolo')
    .setDescription('🎡 Zakręć Kołem Fortuny - wygraj nawet 10x zakładu!')
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

    const result = spinWheel();

    const frames = 7;
    for (let i = 0; i < frames; i++) {
      const isLast = i === frames - 1;
      const seg = isLast ? result : GameHelper.getRandomChoice(SEGMENTS);
      await interaction.editReply({
        embeds: [pendingEmbed(
          'Koło Fortuny',
          pendingList(
            isLast ? 'Koło się zatrzymało.' : 'Koło się kręci...',
            [['Zakład', formatUsd(bet)], ['Pole', `${seg.emoji} ${seg.label}`]],
          ),
        )],
      });
      await new Promise(r => setTimeout(r, 220 + i * 90));
    }

    await new Promise(r => setTimeout(r, 350));

    const winnings = Math.floor(bet * result.mult);
    const profit = winnings - bet;
    const isWin = winnings > bet;
    const isPush = winnings === bet;
    const outcome: 'win' | 'tie' | 'loss' = isWin ? 'win' : isPush ? 'tie' : 'loss';

    await client.db.updateMoney(userId, profit);
    await client.db.recordGame(userId, 'kolo', bet, winnings, outcome);
    await client.db.updateQuestProgress(userId, {
      play_games: 1,
      play_kolo: 1,
      wager: bet,
      ...(isWin ? { win_games: 1 } : {}),
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const row = koloAgainRow(bet, userId);

    let extra: string | undefined;
    if (newAchievements.length > 0) {
      extra = `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
    }

    if (isPush) {
      const embed = infoGameEmbed(
        'Koło Fortuny',
        extra ?? 'Zwrot zakładu.',
        { bet, result: `${result.emoji} ${result.label}`, balance: newData.money },
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    const embed = gameResultEmbed({
      title: result.mult >= 10 ? 'Koło Fortuny · Jackpot' : 'Koło Fortuny',
      won: isWin,
      bet,
      result: `${result.emoji} ${result.label}`,
      balance: newData.money,
      extra,
    });
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
