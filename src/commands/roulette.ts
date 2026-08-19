import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { getUserLang, t } from '../i18n';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('ruletka')
    .setDescription('🎡 Zagraj w ruletkę europejską!')
    .addStringOption(option =>
      option
        .setName('typ')
        .setDescription('Rodzaj zakładu')
        .setRequired(true)
        .addChoices(
          { name: '🔴 Czerwony (2x)', value: 'red' },
          { name: '⚫ Czarny (2x)', value: 'black' },
          { name: '🟢 Zero (35x)', value: 'zero' },
          { name: '1️⃣ Liczba 1-36 (35x)', value: 'number' },
          { name: '📊 Parzysta (2x)', value: 'even' },
          { name: '📊 Nieparzysta (2x)', value: 'odd' },
          { name: '🔽 Niskie 1-18 (2x)', value: 'low' },
          { name: '🔼 Wysokie 19-36 (2x)', value: 'high' },
          { name: '1️⃣2️⃣ Tuzin 1-12 (3x)', value: 'dozen1' },
          { name: '1️⃣3️⃣ Tuzin 13-24 (3x)', value: 'dozen2' },
          { name: '2️⃣5️⃣ Tuzin 25-36 (3x)', value: 'dozen3' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Kwota do postawienia (min. $100)')
        .setRequired(true)
        .setMinValue(100)
    )
    .addIntegerOption(option =>
      option
        .setName('liczba')
        .setDescription('Konkretna liczba (tylko gdy typ = Liczba 1-36)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(36)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const betType = interaction.options.getString('typ', true);
    const bet = interaction.options.getInteger('zakład', true);
    const number = interaction.options.getInteger('liczba');
    const userId = interaction.user.id;

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające środki',
        `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**`
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    if (betType === 'number' && !number) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Brak liczby',
        'Musisz podać liczbę (1-36) gdy obstawiasz konkretną liczbę.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    await interaction.deferReply();

    const spinFrames = [
      '🔴 × ⚫ × 🔴',
      '⚫ × 🔴 × ⚫',
      '🔴 × ⚫ × 🔴',
      '⚫ × 🔴 × ⚫',
    ];

    for (const frame of spinFrames) {
      await interaction.editReply({
        embeds: [pendingEmbed(
          'Ruletka',
          pendingList('Koło się kręci.', [['Zakład', formatUsd(bet)]], frame),
        )],
      });
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    const result = Math.floor(Math.random() * 37);

    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

    const isRed = redNumbers.includes(result);
    const isBlack = blackNumbers.includes(result);
    const isEven = result !== 0 && result % 2 === 0;
    const isOdd = result !== 0 && result % 2 === 1;

    let won = false;
    let multiplier = 0;
    let winDescription = '';

    switch (betType) {
      case 'red':
        won = isRed;
        multiplier = 2;
        winDescription = '🔴 Czerwony';
        break;
      case 'black':
        won = isBlack;
        multiplier = 2;
        winDescription = '⚫ Czarny';
        break;
      case 'zero':
        won = result === 0;
        multiplier = 35;
        winDescription = '🟢 Zero';
        break;
      case 'number':
        won = result === number;
        multiplier = 35;
        winDescription = `🎯 Liczba ${number}`;
        break;
      case 'even':
        won = isEven;
        multiplier = 2;
        winDescription = '📊 Parzysta';
        break;
      case 'odd':
        won = isOdd;
        multiplier = 2;
        winDescription = '📊 Nieparzysta';
        break;
      case 'low':
        won = result >= 1 && result <= 18;
        multiplier = 2;
        winDescription = '🔽 Niskie (1-18)';
        break;
      case 'high':
        won = result >= 19 && result <= 36;
        multiplier = 2;
        winDescription = '🔼 Wysokie (19-36)';
        break;
      case 'dozen1':
        won = result >= 1 && result <= 12;
        multiplier = 3;
        winDescription = '1️⃣2️⃣ Tuzin 1-12';
        break;
      case 'dozen2':
        won = result >= 13 && result <= 24;
        multiplier = 3;
        winDescription = '1️⃣3️⃣ Tuzin 13-24';
        break;
      case 'dozen3':
        won = result >= 25 && result <= 36;
        multiplier = 3;
        winDescription = '2️⃣5️⃣ Tuzin 25-36';
        break;
    }

    let netProfit = 0;
    let winAmount = 0;
    if (won) {
      netProfit = bet * multiplier - bet;
      winAmount = bet * multiplier;
      await client.db.updateMoney(userId, netProfit);
      await client.db.recordGame(userId, 'roulette', bet, winAmount, 'win');
      await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, wager: bet });
    } else {
      netProfit = -bet;
      await client.db.updateMoney(userId, netProfit);
      await client.db.recordGame(userId, 'roulette', bet, 0, 'loss');
      await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
    }

    const lang = await getUserLang(client.db, userId);
    const newAchievements = await client.db.checkAchievements(userId);

    let resultColor = '🟢';
    let resultText = '0 (zero)';

    if (result !== 0) {
      if (isRed) {
        resultColor = '🔴';
        resultText = `${result} (czerwony)`;
      } else {
        resultColor = '⚫';
        resultText = `${result} (czarny)`;
      }
    }

    const newUserData = await client.db.getUser(userId);
    const extraParts = [
      won ? `Trafione · **${multiplier}x**` : 'Nie tym razem.',
    ];
    if (newAchievements.length > 0) {
      extraParts.push(`Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`);
    }

    const embed = gameResultEmbed({
      title: 'Ruletka',
      won,
      bet,
      result: `${resultColor} ${resultText}`,
      balance: newUserData.money,
      details: [['Twój zakład', winDescription]],
      extra: extraParts.join('\n'),
    });

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:ruletka:${bet}:${betType}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    await interaction.editReply({ content: '', embeds: [embed], components: [row] });
  },
};
