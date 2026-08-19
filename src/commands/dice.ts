import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { getUserLang, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

const DICE_FACES: { [key: number]: string } = {
  1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅'
};

export default {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('🎲 Rzuć kością i zgadnij wynik (wygrana 5x)')
    .addIntegerOption(option =>
      option
        .setName('liczba')
        .setDescription('Zgadnij liczbę (1-6)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(6)
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Kwota do postawienia (min. $50)')
        .setRequired(true)
        .setMinValue(50)
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

    await interaction.editReply({
      embeds: [pendingEmbed(
        t(lang, 'dice_title'),
        pendingList(t(lang, 'dice_rolling'), [['Zakład', formatUsd(bet)]]),
      )],
    });
    await new Promise(r => setTimeout(r, 1000));

    const result   = GameHelper.getRandomNumber(1, 6);
    const won      = guess === result;
    const diceFace = DICE_FACES[result];

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:dice:${bet}:${guess}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    if (won) {
      const winnings = bet * (GAMES.dice.payout - 1);
      await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'dice', bet, bet + winnings, 'win');
      await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, wager: bet });
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      const embed = gameResultEmbed({
        title: t(lang, 'dice_title'),
        won: true,
        bet,
        result: `${diceFace} ${result}`,
        balance: newData.money,
        details: [['Twój typ', `${DICE_FACES[guess]} ${guess}`]],
        extra: newAchievements.length > 0
          ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
          : t(lang, 'dice_win')(winnings),
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await client.db.updateMoney(userId, -bet);
      await client.db.recordGame(userId, 'dice', bet, 0, 'loss');
      await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
      await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      const embed = gameResultEmbed({
        title: t(lang, 'dice_title'),
        won: false,
        bet,
        result: `${diceFace} ${result}`,
        balance: newData.money,
        details: [['Twój typ', `${DICE_FACES[guess]} ${guess}`]],
        extra: t(lang, 'dice_loss')(bet),
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  },
};
