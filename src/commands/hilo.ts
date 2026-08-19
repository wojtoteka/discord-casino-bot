import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ComponentType } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { HILO } from '../config/constants';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const activeHilo = new Set<string>();

function hiloPlayAgainRow(bet: number, userId: string, lang: 'pl' | 'en') {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:hilo:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    playAgainLabel: t(lang, 'btn_play_again'),
    balanceLabel: t(lang, 'btn_balance'),
  });
}
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_MAP: { [key: string]: number } = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function drawCard(): { value: string; suit: string; rank: number } {
  const value = VALUES[Math.floor(Math.random() * VALUES.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { value, suit, rank: VALUE_MAP[value] };
}

function formatCard(card: { value: string; suit: string }): string {
  return `**${card.suit} ${card.value}**`;
}

/**
 * How many of the 13 ranks beat the current card in the chosen direction.
 * Ties do NOT count — a draw loses, so the two directions never overlap.
 */
function winningCards(currentCard: { rank: number }, direction: 'higher' | 'lower'): number {
  return direction === 'higher'
    ? 14 - currentCard.rank   // ranks strictly above (rank+1 … 14)
    : currentCard.rank - 2;   // ranks strictly below (2 … rank-1)
}

/**
 * Payout derived from the real odds, not a coarse tier table.
 * Fair return is 13 / winningCards; HOUSE_EDGE shaves the casino's cut off it.
 * Returns 0 when the direction cannot win — the button is disabled in that case.
 */
function calculateMultiplier(currentCard: { rank: number }, direction: 'higher' | 'lower'): number {
  const wins = winningCards(currentCard, direction);
  if (wins <= 0) return 0;
  return Math.floor((13 / wins) * HILO.houseEdge * 100) / 100;
}

export default {
  data: new SlashCommandBuilder()
    .setName('hilo')
    .setDescription('🔼 Wyższa czy Niższa? Zgadnij i mnóż wygraną!')
    .setDescriptionLocalizations(slashLocales('Higher or lower? Guess and stack the multiplier'))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $100)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $100)'))
        .setRequired(true)
        .setMinValue(100)
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

    if (activeHilo.has(userId)) {
      const embed = EmbedHelper.warningEmbed(
        t(lang, 'game_in_progress_title'),
        t(lang, 'game_in_progress'),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    activeHilo.add(userId);
    try {
      await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
    } catch (error) {
      activeHilo.delete(userId);
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

    let currentCard = drawCard();
    let totalMultiplier = 1.0;
    let round = 1;
    let settled = false;

    const buildGameEmbed = (message?: string) => {
      const potentialWin = Math.floor(bet * totalMultiplier);
      return pendingEmbed(
        t(lang, 'hilo_title'),
        pendingList(
          message || t(lang, 'hilo_prompt'),
          [
            [t(lang, 'hilo_card'), formatCard(currentCard)],
            [t(lang, 'label_bet'), formatUsd(bet)],
            [t(lang, 'hilo_round'), String(round)],
            [t(lang, 'hilo_multi'), `x${totalMultiplier.toFixed(2)}`],
            [t(lang, 'hilo_potential'), formatUsd(potentialWin)],
          ],
        ),
      );
    };

    const buildButtons = () => {
      const higherMult = calculateMultiplier(currentCard, 'higher');
      const lowerMult = calculateMultiplier(currentCard, 'lower');
      const canCashout = round > 1;

      return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('hilo_higher')
            .setLabel(higherMult > 0 ? `⬆️ ${t(lang, 'hilo_higher')} (x${higherMult.toFixed(2)})` : `⬆️ ${t(lang, 'hilo_higher')}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(higherMult <= 0),
          new ButtonBuilder()
            .setCustomId('hilo_lower')
            .setLabel(lowerMult > 0 ? `⬇️ ${t(lang, 'hilo_lower')} (x${lowerMult.toFixed(2)})` : `⬇️ ${t(lang, 'hilo_lower')}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(lowerMult <= 0),
          new ButtonBuilder()
            .setCustomId('hilo_cashout')
            .setLabel(canCashout ? `💸 ${t(lang, 'btn_cashout')} $${Math.floor(bet * totalMultiplier).toLocaleString()}` : `💸 ${t(lang, 'btn_cashout')}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(!canCashout),
        );
    };

    try {
      await interaction.reply({ embeds: [buildGameEmbed()], components: [buildButtons()] });
    } catch (error) {
      activeHilo.delete(userId);
      throw error;
    }
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (i) => i.user.id === userId && i.customId.startsWith('hilo_'),
    });

    const onCollect = async (buttonInteraction: ButtonInteraction) => {
      if (settled) return;
      if (buttonInteraction.customId === 'hilo_cashout') {
        if (round <= 1) return;
        settled = true;
        collector.stop('cashed');
      }

      try {
        await buttonInteraction.deferUpdate();
      } catch {
        if (buttonInteraction.customId !== 'hilo_cashout') return;
      }

      if (buttonInteraction.customId === 'hilo_cashout') {
        const winnings = Math.floor(bet * totalMultiplier);
        await withUserLock(userId, async () => {
          await client.db.updateMoney(userId, winnings);
          await client.db.recordGame(userId, 'hilo', bet, winnings, 'win');
        });
        const newAchievements = await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        let extra = t(lang, 'hilo_cashed')(round - 1, formatCard(currentCard), `x${totalMultiplier.toFixed(2)}`);
        if (newAchievements.length > 0) {
          extra += t(lang, 'new_achievements')(formatAchievementNamesInline(newAchievements));
        }

        const embed = gameResultEmbed({
          title: t(lang, 'hilo_title'),
          won: true,
          bet,
          result: `x${totalMultiplier.toFixed(2)} · $${winnings.toLocaleString()}`,
          balance: newData.money,
          extra,
          lang,
        });

        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId('d1').setLabel(`⬆️ ${t(lang, 'hilo_higher')}`).setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d2').setLabel(`⬇️ ${t(lang, 'hilo_lower')}`).setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d3').setLabel(`💸 ${t(lang, 'btn_cashout')}`).setStyle(ButtonStyle.Success).setDisabled(true),
          );

        await buttonInteraction.editReply({ embeds: [embed], components: [disabledRow, hiloPlayAgainRow(bet, userId, lang)] });
        return;
      }

      if (settled) return;

      const direction = buttonInteraction.customId === 'hilo_higher' ? 'higher' : 'lower';
      const nextCard = drawCard();
      const multiplierGain = calculateMultiplier(currentCard, direction);

      const correct = direction === 'higher'
        ? nextCard.rank > currentCard.rank
        : nextCard.rank < currentCard.rank;

      if (multiplierGain <= 0) {
        await buttonInteraction.followUp({
          embeds: [EmbedHelper.warningEmbed(t(lang, 'hilo_title'), t(lang, 'hilo_no_direction'))],
          flags: 64,
        });
        return;
      }

      if (correct) {
        totalMultiplier *= multiplierGain;
        totalMultiplier = Math.round(totalMultiplier * 100) / 100;
        round++;
        currentCard = nextCard;

        const embed = buildGameEmbed(
          `${formatCard(nextCard)} · ${direction === 'higher' ? t(lang, 'hilo_higher') : t(lang, 'hilo_lower')}\n` +
          `${t(lang, 'hilo_multi')}: **x${totalMultiplier.toFixed(2)}**`,
        );

        await buttonInteraction.editReply({ embeds: [embed], components: [buildButtons()] });
      } else {
        settled = true;
        collector.stop('lost');

        await withUserLock(userId, () => client.db.recordGame(userId, 'hilo', bet, 0, 'loss'));
        await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        const embed = gameResultEmbed({
          title: t(lang, 'hilo_title'),
          won: false,
          bet,
          result: `${t(lang, 'hilo_round')} ${round}`,
          balance: newData.money,
          extra:
            `${formatCard(currentCard)} → ${formatCard(nextCard)}\n` +
            `${direction === 'higher' ? t(lang, 'hilo_higher') : t(lang, 'hilo_lower')}`,
          lang,
        });

        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId('d1').setLabel(`⬆️ ${t(lang, 'hilo_higher')}`).setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d2').setLabel(`⬇️ ${t(lang, 'hilo_lower')}`).setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d3').setLabel('❌').setStyle(ButtonStyle.Danger).setDisabled(true),
          );

        await buttonInteraction.editReply({ embeds: [embed], components: [disabledRow, hiloPlayAgainRow(bet, userId, lang)] });
      }
    };

    let collectQueue: Promise<void> = Promise.resolve();
    collector.on('collect', (buttonInteraction) => {
      collectQueue = collectQueue
        .then(() => onCollect(buttonInteraction))
        .catch((err) => console.error('❌ Hi-Lo collect:', err));
    });

    collector.on('end', async (_collected, reason) => {
      try {
        await collectQueue;
        if (settled) return;
        settled = true;
        if (reason === 'time' && totalMultiplier > 1.0) {
          const winnings = Math.floor(bet * totalMultiplier);
          await withUserLock(userId, async () => {
            await client.db.updateMoney(userId, winnings);
            await client.db.recordGame(userId, 'hilo', bet, winnings, 'win');
          });
          const newData = await client.db.getUser(userId);

          const embed = gameResultEmbed({
            title: t(lang, 'hilo_title'),
            won: true,
            bet,
            result: `x${totalMultiplier.toFixed(2)} · $${winnings.toLocaleString()}`,
            balance: newData.money,
            extra: t(lang, 'hilo_timeout_cash'),
            lang,
          });
          try { await interaction.editReply({ embeds: [embed], components: [hiloPlayAgainRow(bet, userId, lang)] }); } catch {}
        } else if (reason === 'time') {
          await withUserLock(userId, () => client.db.recordGame(userId, 'hilo', bet, 0, 'loss'));
          const newData = await client.db.getUser(userId);

          const embed = gameResultEmbed({
            title: t(lang, 'hilo_title'),
            won: false,
            bet,
            result: t(lang, 'hilo_timeout_loss')(bet),
            balance: newData.money,
            extra: t(lang, 'hilo_timeout_loss')(bet),
            lang,
          });
          try { await interaction.editReply({ embeds: [embed], components: [hiloPlayAgainRow(bet, userId, lang)] }); } catch {}
        }
      } finally {
        activeHilo.delete(userId);
      }
    });
  },
};
