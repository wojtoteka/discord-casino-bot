import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

const DICE_FACES: { [key: number]: string } = {
  1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅',
};

export default {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('🎲 Rzuć kością i zgadnij wynik (wygrana 5x)')
    .setDescriptionLocalizations(slashLocales('🎲 Roll a die and guess the result (5x payout)'))
    .addIntegerOption(option =>
      option
        .setName('liczba')
        .setNameLocalizations(slashNameLocales('number'))
        .setDescription('Zgadnij liczbę (1-6)')
        .setDescriptionLocalizations(slashLocales('Guess a number (1-6)'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(6),
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $50)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $50)'))
        .setRequired(true)
        .setMinValue(50),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const guess  = interaction.options.getInteger('liczba', true);
    const bet    = interaction.options.getInteger('zakład', true);
    const userId = interaction.user.id;
    const lang   = await getUserLang(client.db, userId);

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'error_insufficient_funds')(bet, userData.money),
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

    await interaction.editReply({
      embeds: [pendingEmbed(
        t(lang, 'dice_title'),
        pendingList(t(lang, 'dice_rolling'), [[t(lang, 'label_bet'), formatUsd(bet)]]),
      )],
    });
    await new Promise(r => setTimeout(r, 1000));

    const result   = GameHelper.getRandomNumber(1, 6);
    const won      = guess === result;
    const diceFace = DICE_FACES[result];
    const payout   = bet * GAMES.dice.payout;

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:dice:${bet}:${guess}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    await withUserLock(userId, async () => {
      if (won) await client.db.updateMoney(userId, payout);
      await client.db.recordGame(userId, 'dice', bet, won ? payout : 0, won ? 'win' : 'loss');
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        wager: bet,
        ...(won ? { win_games: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const embed = gameResultEmbed({
      title: t(lang, 'dice_title'),
      won,
      bet,
      result: `${diceFace} ${result}`,
      balance: newData.money,
      details: [[t(lang, 'dice_guess'), `${DICE_FACES[guess]} ${guess}`]],
      extra: won
        ? (newAchievements.length > 0
          ? t(lang, 'new_achievements')(formatAchievementNamesInline(newAchievements)).trim()
          : t(lang, 'dice_win')(payout - bet))
        : t(lang, 'dice_loss')(bet),
      lang,
    });
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
