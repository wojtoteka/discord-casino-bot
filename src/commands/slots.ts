import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('🎰 Zagraj na automacie - postaw od 1 do 20 kredytów!')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Liczba kredytów do postawienia (1-20)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
    const userId = interaction.user.id;

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAffordCredits(userData.credits, bet)) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające kredyty',
        `Potrzebujesz **${bet} kredytów** ale masz tylko **${userData.credits} kredytów**\n\nUżyj \`/kup-kredyty\` aby kupić więcej kredytów.`
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const symbolPool = [
      '🍒', '🍒', '🍒', '🍒', '🍒',
      '🍋', '🍋', '🍋', '🍋',
      '🍊', '🍊', '🍊',
      '🍇', '🍇',
      '⭐',
      '💎'
    ];

    const payouts: { [key: string]: number } = {
      '🍒': 3,
      '🍋': 5,
      '🍊': 10,
      '🍇': 20,
      '⭐': 50,
      '💎': 100
    };

    const twoOfKindMultiplier: { [key: string]: number } = {
      '🍒': 0,
      '🍋': 1,
      '🍊': 2,
      '🍇': 3,
      '⭐': 5,
      '💎': 10
    };

    await interaction.deferReply();

    const reel1 = GameHelper.getRandomChoice(symbolPool);
    const reel2 = GameHelper.getRandomChoice(symbolPool);
    const reel3 = GameHelper.getRandomChoice(symbolPool);

    const spinFrames = [
      '🎰 × 🎰 × 🎰',
      '🔄 × 🔄 × 🔄',
      '🎲 × 🎲 × 🎲',
    ];

    for (const frame of spinFrames) {
      await interaction.editReply({
        embeds: [pendingEmbed('Slots', pendingList('Kręcenie bębnów.', [['Zakład', `${bet} kr.`]], frame))],
      });
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    let winnings = 0;
    let extra = '';

    if (reel1 === reel2 && reel2 === reel3) {
      const multiplier = payouts[reel1];
      winnings = multiplier * bet;

      if (reel1 === '💎') {
        extra = `Jackpot — trzy diamenty (**${multiplier}x**)`;
      } else if (reel1 === '⭐') {
        extra = `Trzy gwiazdki (**${multiplier}x**)`;
      } else {
        extra = `Trzy ${reel1} · **${multiplier}x**`;
      }
    } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
      const matchedSymbol = reel1 === reel2 ? reel1 : (reel2 === reel3 ? reel2 : reel1);
      const multiplier = twoOfKindMultiplier[matchedSymbol];

      if (multiplier > 0) {
        winnings = multiplier * bet;
        extra = `Dwa ${matchedSymbol} · **${multiplier}x**`;
      } else {
        extra = 'Prawie. Spróbuj ponownie.';
      }
    } else {
      extra = 'Brak wygranej.';
    }

    const netProfit = winnings - bet;

    await client.db.updateCredits(userId, netProfit);

    const result = winnings > bet ? 'win' : (winnings > 0 ? 'tie' : 'loss');
    await client.db.recordGame(userId, 'slots', bet, winnings, result);
    await client.db.updateQuestProgress(userId, { play_slots: 1, play_games: 1, ...(result === 'win' ? { win_games: 1 } : {}) });
    const newAchievements = await client.db.checkAchievements(userId);

    const newUserData = await client.db.getUser(userId);

    if (newAchievements.length > 0) {
      extra += `\nNowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
    }
    extra += `\nPozostało **${newUserData.credits}** kredytów`;

    const outcomeLabel = winnings > bet
      ? `+${netProfit} kredytów`
      : winnings > 0
        ? `${netProfit === 0 ? 'zwrot' : `${netProfit} kredytów`}`
        : `-${bet} kredytów`;

    const embed = gameResultEmbed({
      title: 'Slots',
      won: winnings > bet,
      bet,
      result: `${reel1} ${reel2} ${reel3} · ${outcomeLabel}`,
      balance: newUserData.credits,
      extra,
      unit: 'credits',
    });

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:slots:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    });

    await interaction.editReply({ content: '', embeds: [embed], components: [row] });
  },
};
