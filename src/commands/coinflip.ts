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
    .setName('coinflip')
    .setDescription('🪙 Rzuć monetą i postaw zakład (wygrana 2x)')
    .addStringOption(option =>
      option
        .setName('wybór')
        .setDescription('Wybierz orła lub reszkę')
        .setRequired(true)
        .addChoices(
          { name: '🦅 Orzeł', value: 'heads' },
          { name: '🌟 Reszka', value: 'tails' }
        )
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

    await interaction.editReply({
      embeds: [pendingEmbed(
        t(lang, 'coinflip_title'),
        pendingList(t(lang, 'coinflip_spinning'), [['Zakład', formatUsd(bet)]]),
      )],
    });
    await new Promise(r => setTimeout(r, 1000));

    const result     = GameHelper.getRandomChoice(['heads', 'tails']);
    const won        = choice === result;
    const choiceText = choice === 'heads' ? '🦅 Orzeł' : '🌟 Reszka';
    const resultText = result === 'heads' ? '🦅 Orzeł' : '🌟 Reszka';

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:coinflip:${bet}:${choice}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    if (won) {
      await client.db.updateMoney(userId, bet);
      await client.db.recordGame(userId, 'coinflip', bet, bet * 2, 'win');
      await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, win_coinflip: 1, wager: bet });
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      const embed = gameResultEmbed({
        title: t(lang, 'coinflip_title'),
        won: true,
        bet,
        result: resultText,
        balance: newData.money,
        details: [['Twój wybór', choiceText]],
        extra: newAchievements.length > 0
          ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
          : t(lang, 'coinflip_win')(bet),
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await client.db.updateMoney(userId, -bet);
      await client.db.recordGame(userId, 'coinflip', bet, 0, 'loss');
      await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
      await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      const embed = gameResultEmbed({
        title: t(lang, 'coinflip_title'),
        won: false,
        bet,
        result: resultText,
        balance: newData.money,
        details: [['Twój wybór', choiceText]],
        extra: t(lang, 'coinflip_loss')(bet),
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  },
};
