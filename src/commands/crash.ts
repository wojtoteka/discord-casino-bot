import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

function generateCrashPoint(): number {
  const e = 2 ** 32;
  const h = Math.floor(Math.random() * e);
  if (h % 25 === 0) return 1.00;
  return Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);
}

function getMultiplierBar(multiplier: number): string {
  const filled = Math.min(Math.floor(multiplier * 2), 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `\`[${bar}]\``;
}

export default {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('📈 Gra Crash - wypłać zanim spadnie!')
    .setDescriptionLocalizations(slashLocales('📈 Crash — cash out before it drops'))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $100)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $100)'))
        .setRequired(true)
        .setMinValue(100),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
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

    try {
      await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const latest = await client.db.getUser(userId);
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(
            t(lang, 'insufficient_funds_title'),
            t(lang, 'error_insufficient_funds')(bet, latest.money),
          )],
          flags: 64,
        });
        return;
      }
      throw error;
    }

    const crashPoint = generateCrashPoint();
    let currentMultiplier = 1.00;
    let cashed = false;
    let crashed = false;

    const cashOutButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel(`💸 ${t(lang, 'crash_cashout')}`)
          .setStyle(ButtonStyle.Success),
      );

    const disabledButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel(`💸 ${t(lang, 'crash_cashout')}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
      );

    const againRow = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:crash:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    const startEmbed = pendingEmbed(
      t(lang, 'crash_title'),
      pendingList(
        t(lang, 'crash_prompt'),
        [
          [t(lang, 'crash_multi'), `x${currentMultiplier.toFixed(2)}`],
          [t(lang, 'label_bet'), formatUsd(bet)],
        ],
      ) + `\n${getMultiplierBar(currentMultiplier)}`,
    );

    await interaction.reply({ embeds: [startEmbed], components: [cashOutButton] });
    const reply = await interaction.fetchReply();

    // Long enough for a ~100x crash (~17 min of ticks). Timeout is NOT a loss.
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 20 * 60 * 1000,
      filter: (i) => i.user.id === userId && i.customId === 'crash_cashout',
    });

    collector.on('collect', async (buttonInteraction) => {
      if (cashed || crashed) return;
      cashed = true;
      collector.stop('cashed');

      const winnings = Math.floor(bet * currentMultiplier);
      const profit = winnings - bet;

      await withUserLock(userId, async () => {
        await client.db.updateMoney(userId, winnings);
        await client.db.recordGame(userId, 'crash', bet, winnings, 'win');
      });
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      let extra = getMultiplierBar(currentMultiplier);
      if (newAchievements.length > 0) {
        extra += t(lang, 'new_achievements')(formatAchievementNamesInline(newAchievements));
      }

      const embed = gameResultEmbed({
        title: t(lang, 'crash_title'),
        won: true,
        bet,
        result: `x${currentMultiplier.toFixed(2)} · +$${profit.toLocaleString()}`,
        balance: newData.money,
        extra,
        lang,
      });

      await buttonInteraction.update({ embeds: [embed], components: [disabledButton, againRow] });
    });

    const tick = async () => {
      if (cashed || crashed) return;

      currentMultiplier += 0.05 + Math.random() * 0.15;
      currentMultiplier = Math.round(currentMultiplier * 100) / 100;

      if (currentMultiplier >= crashPoint) {
        if (cashed) return;
        crashed = true;
        collector.stop('crashed');

        await withUserLock(userId, async () => {
          await client.db.recordGame(userId, 'crash', bet, 0, 'loss');
        });
        await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        const embed = gameResultEmbed({
          title: t(lang, 'crash_title'),
          won: false,
          bet,
          result: `x${crashPoint.toFixed(2)}`,
          balance: newData.money,
          extra: t(lang, 'crash_fell')(`x${crashPoint.toFixed(2)}`),
          lang,
        });

        try {
          await interaction.editReply({ embeds: [embed], components: [disabledButton, againRow] });
        } catch {}
        return;
      }

      const potentialWin = Math.floor(bet * currentMultiplier);
      const embed = pendingEmbed(
        t(lang, 'crash_title'),
        pendingList(
          t(lang, 'crash_growing'),
          [
            [t(lang, 'crash_multi'), `x${currentMultiplier.toFixed(2)}`],
            [t(lang, 'crash_potential'), formatUsd(potentialWin)],
          ],
        ) + `\n${getMultiplierBar(currentMultiplier)}`,
      );

      try {
        await interaction.editReply({ embeds: [embed], components: [cashOutButton] });
      } catch {}

      setTimeout(tick, 1000 + Math.random() * 500);
    };

    setTimeout(tick, 1500);

    collector.on('end', () => {
      // Game ends only on crash point or cashout. A collector timeout must not
      // record a loss while the round is still climbing.
    });
  },
};
