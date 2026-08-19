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

export default {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('🪙 Rzuć monetą i postaw zakład (wygrana 2x)')
    .setDescriptionLocalizations(slashLocales('Flip a coin and bet (2x payout)'))
    .addStringOption(option =>
      option
        .setName('wybór')
        .setNameLocalizations(slashNameLocales('choice'))
        .setDescription('Wybierz orła lub reszkę')
        .setDescriptionLocalizations(slashLocales('Pick heads or tails'))
        .setRequired(true)
        .addChoices(
          { name: '🦅 Orzeł', name_localizations: slashNameLocales('🦅 Heads'), value: 'heads' },
          { name: '🌟 Reszka', name_localizations: slashNameLocales('🌟 Tails'), value: 'tails' },
        ),
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
    const choice = interaction.options.getString('wybór', true);
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
        t(lang, 'coinflip_title'),
        pendingList(t(lang, 'coinflip_spinning'), [[t(lang, 'label_bet'), formatUsd(bet)]]),
      )],
    });
    await new Promise(r => setTimeout(r, 1000));

    const result     = GameHelper.getRandomChoice(['heads', 'tails']);
    const won        = choice === result;
    const payout     = bet * GAMES.coinflip.payout;
    const choiceText = choice === 'heads' ? t(lang, 'coinflip_heads') : t(lang, 'coinflip_tails');
    const resultText = result === 'heads' ? t(lang, 'coinflip_heads') : t(lang, 'coinflip_tails');

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:coinflip:${bet}:${choice}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    await withUserLock(userId, async () => {
      if (won) await client.db.updateMoney(userId, payout);
      await client.db.recordGame(userId, 'coinflip', bet, won ? payout : 0, won ? 'win' : 'loss');
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        wager: bet,
        ...(won ? { win_games: 1, win_coinflip: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const embed = gameResultEmbed({
      title: t(lang, 'coinflip_title'),
      won,
      bet,
      result: resultText,
      balance: newData.money,
      details: [[t(lang, 'coinflip_choice'), choiceText]],
      extra: won
        ? (newAchievements.length > 0
          ? t(lang, 'new_achievements')(formatAchievementNamesInline(newAchievements)).trim()
          : t(lang, 'coinflip_win')(payout - bet))
        : t(lang, 'coinflip_loss')(bet),
      lang,
    });
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
