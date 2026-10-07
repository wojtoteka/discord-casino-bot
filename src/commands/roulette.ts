import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome } from '../utils/gameView';
import { renderRoulette, safeRender } from '../render';
import type { Lang } from '../i18n';

function rouletteTypeLabel(lang: Lang, betType: string, number: number | null): string {
  switch (betType) {
    case 'red': return t(lang, 'card_rl_red');
    case 'black': return t(lang, 'card_rl_black');
    case 'zero': return t(lang, 'card_rl_zero');
    case 'number': return t(lang, 'card_rl_number')(number ?? 0);
    case 'even': return t(lang, 'card_rl_even');
    case 'odd': return t(lang, 'card_rl_odd');
    case 'low': return '1-18';
    case 'high': return '19-36';
    case 'dozen1': return '1-12';
    case 'dozen2': return '13-24';
    default: return '25-36';
  }
}
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

export default {
  data: new SlashCommandBuilder()
    .setName('ruletka')
    .setNameLocalizations(slashNameLocales('roulette'))
    .setDescription('🎡 Zagraj w ruletkę europejską!')
    .setDescriptionLocalizations(slashLocales('🎡 Play European roulette'))
    .addStringOption(option =>
      option
        .setName('typ')
        .setNameLocalizations(slashNameLocales('type'))
        .setDescription('Rodzaj zakładu')
        .setDescriptionLocalizations(slashLocales('Bet type'))
        .setRequired(true)
        .addChoices(
          { name: '🔴 Czerwony (2x)', name_localizations: slashNameLocales('🔴 Red (2x)'), value: 'red' },
          { name: '⚫ Czarny (2x)', name_localizations: slashNameLocales('⚫ Black (2x)'), value: 'black' },
          { name: '🟢 Zero (35x)', value: 'zero' },
          { name: '1️⃣ Liczba 1-36 (35x)', name_localizations: slashNameLocales('1️⃣ Number 1-36 (35x)'), value: 'number' },
          { name: '📊 Parzysta (2x)', name_localizations: slashNameLocales('📊 Even (2x)'), value: 'even' },
          { name: '📊 Nieparzysta (2x)', name_localizations: slashNameLocales('📊 Odd (2x)'), value: 'odd' },
          { name: '🔽 Niskie 1-18 (2x)', name_localizations: slashNameLocales('🔽 Low 1-18 (2x)'), value: 'low' },
          { name: '🔼 Wysokie 19-36 (2x)', name_localizations: slashNameLocales('🔼 High 19-36 (2x)'), value: 'high' },
          { name: '1️⃣2️⃣ Tuzin 1-12 (3x)', name_localizations: slashNameLocales('1️⃣2️⃣ Dozen 1-12 (3x)'), value: 'dozen1' },
          { name: '1️⃣3️⃣ Tuzin 13-24 (3x)', name_localizations: slashNameLocales('1️⃣3️⃣ Dozen 13-24 (3x)'), value: 'dozen2' },
          { name: '2️⃣5️⃣ Tuzin 25-36 (3x)', name_localizations: slashNameLocales('2️⃣5️⃣ Dozen 25-36 (3x)'), value: 'dozen3' },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $100)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $100)'))
        .setRequired(true)
        .setMinValue(100),
    )
    .addIntegerOption(option =>
      option
        .setName('liczba')
        .setNameLocalizations(slashNameLocales('number'))
        .setDescription('Konkretna liczba (tylko gdy typ = Liczba 1-36)')
        .setDescriptionLocalizations(slashLocales('Specific number (only when type = Number 1-36)'))
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(36),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const betType = interaction.options.getString('typ', true);
    const bet = interaction.options.getInteger('zakład', true);
    const number = interaction.options.getInteger('liczba');
    const userId = interaction.user.id;
    const lang = await getUserLang(client.db, userId);

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'error_insufficient_funds')(bet, userData.money),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    if (betType === 'number' && !number) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'roulette_need_number_title'),
        t(lang, 'roulette_need_number'),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    await interaction.deferReply();

    try {
      await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const latest = await client.db.getUser(userId);
        await interaction.editReply({
          embeds: [EmbedHelper.errorEmbed(
            t(lang, 'insufficient_funds_title'),
            t(lang, 'error_insufficient_funds')(bet, latest.money),
          )],
        });
        return;
      }
      throw error;
    }

    const typeLabel = rouletteTypeLabel(lang, betType, number);
    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'roulette_title'),
      kind: 'pending',
      image: await safeRender('roulette', () => renderRoulette({
        result: null,
        outcome: pendingOutcome(t(lang, 'card_roulette_spin'), [
          [t(lang, 'label_bet'), formatUsd(bet)],
          [t(lang, 'card_type'), typeLabel],
        ]),
      })),
      imageName: 'roulette',
      summary: t(lang, 'roulette_spinning'),
    }));
    await new Promise(resolve => setTimeout(resolve, 1100));

    const result = Math.floor(Math.random() * 37);
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
    const isRed = redNumbers.includes(result);
    const isBlack = blackNumbers.includes(result);
    const isEven = result !== 0 && result % 2 === 0;
    const isOdd = result !== 0 && result % 2 === 1;

    let won = false;
    let multiplier = 0;

    switch (betType) {
      case 'red':    won = isRed; multiplier = 2; break;
      case 'black':  won = isBlack; multiplier = 2; break;
      case 'zero':   won = result === 0; multiplier = 35; break;
      case 'number': won = result === number; multiplier = 35; break;
      case 'even':   won = isEven; multiplier = 2; break;
      case 'odd':    won = isOdd; multiplier = 2; break;
      case 'low':    won = result >= 1 && result <= 18; multiplier = 2; break;
      case 'high':   won = result >= 19 && result <= 36; multiplier = 2; break;
      case 'dozen1': won = result >= 1 && result <= 12; multiplier = 3; break;
      case 'dozen2': won = result >= 13 && result <= 24; multiplier = 3; break;
      case 'dozen3': won = result >= 25 && result <= 36; multiplier = 3; break;
    }

    const payout = won ? bet * multiplier : 0;

    await withUserLock(userId, async () => {
      if (won) await client.db.updateMoney(userId, payout);
      await client.db.recordGame(userId, 'roulette', bet, payout, won ? 'win' : 'loss');
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        wager: bet,
        ...(won ? { win_games: 1 } : {}),
      });
    });

    const newAchievements = await client.db.checkAchievements(userId);
    const resultText = result === 0
      ? t(lang, 'roulette_zero')
      : isRed ? t(lang, 'roulette_red')(result) : t(lang, 'roulette_black')(result);

    const newUserData = await client.db.getUser(userId);
    const extraId = betType === 'number' && number
      ? `number:${number}`
      : betType;

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:ruletka:${bet}:${extraId}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    const kind = won ? 'win' : 'loss';
    const image = await safeRender('roulette', () => renderRoulette({
      result,
      outcome: settledOutcome({
        lang,
        kind,
        net: payout - bet,
        bet,
        balance: newUserData.money,
        rows: [
          [t(lang, 'card_type'), typeLabel],
          [t(lang, 'card_result'), resultText],
        ],
      }),
    }));

    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'roulette_title'),
      kind,
      image,
      imageName: 'roulette',
      summary: won ? t(lang, 'roulette_hit')(multiplier) : t(lang, 'roulette_miss'),
      fallback: `${resultText} · ${formatUsd(newUserData.money)}`,
      achievements: newAchievements,
      components: [row],
    }));
  },
};
