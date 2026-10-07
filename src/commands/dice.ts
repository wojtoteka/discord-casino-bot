import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome } from '../utils/gameView';
import { renderDice, safeRender } from '../render';
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

    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'dice_title'),
      kind: 'pending',
      image: await safeRender('dice', () => renderDice({
        rolled: null,
        guess,
        guessLabel: t(lang, 'card_your_pick'),
        outcome: pendingOutcome(t(lang, 'card_dice_roll'), [
          [t(lang, 'label_bet'), formatUsd(bet)],
          [t(lang, 'card_your_pick'), String(guess)],
        ]),
      })),
      imageName: 'dice',
      summary: t(lang, 'dice_rolling'),
    }));
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

    const kind = won ? 'win' : 'loss';
    const image = await safeRender('dice', () => renderDice({
      rolled: result,
      guess,
      guessLabel: t(lang, 'card_your_pick'),
      outcome: settledOutcome({
        lang,
        kind,
        net: won ? payout - bet : -bet,
        bet,
        balance: newData.money,
        rows: [
          [t(lang, 'card_your_pick'), String(guess)],
          [t(lang, 'card_result'), String(result)],
        ],
      }),
    }));
    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'dice_title'),
      kind,
      image,
      imageName: 'dice',
      summary: won ? t(lang, 'dice_win')(payout - bet) : t(lang, 'dice_loss')(bet),
      fallback: `${diceFace} ${result}`,
      achievements: newAchievements,
      components: [row],
    }));
  },
};
