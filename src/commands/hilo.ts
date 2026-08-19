import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ComponentType } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { HILO } from '../config/constants';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const activeHilo = new Set<string>();

function hiloPlayAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:hilo:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
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
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Kwota do postawienia (min. $100)')
        .setRequired(true)
        .setMinValue(100)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
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

    if (activeHilo.has(userId)) {
      const embed = EmbedHelper.warningEmbed(
        '⚠️ Gra w toku',
        'Dokończ obecną grę w Hi-Lo zanim zaczniesz nową.',
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    activeHilo.add(userId);
    try {
      await client.db.updateMoney(userId, -bet);
    } catch (error) {
      activeHilo.delete(userId);
      throw error;
    }

    let currentCard = drawCard();
    let totalMultiplier = 1.0;
    let round = 1;
    let settled = false;

    const buildGameEmbed = (message?: string) => {
      const potentialWin = Math.floor(bet * totalMultiplier);
      return pendingEmbed(
        'Hi-Lo',
        pendingList(
          message || 'Wyższa, niższa, albo wypłać.',
          [
            ['Karta', formatCard(currentCard)],
            ['Zakład', formatUsd(bet)],
            ['Runda', String(round)],
            ['Mnożnik', `x${totalMultiplier.toFixed(2)}`],
            ['Potencjalnie', formatUsd(potentialWin)],
          ],
        ),
      );
    };

    const buildButtons = () => {
      const higherMult = calculateMultiplier(currentCard, 'higher');
      const lowerMult = calculateMultiplier(currentCard, 'lower');
      // Round 1 = no guess made yet. Allowing a cashout here refunded the whole
      // bet, turning every game into a free look at the card.
      const canCashout = round > 1;

      return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('hilo_higher')
            .setLabel(higherMult > 0 ? `⬆️ Wyższa (x${higherMult.toFixed(2)})` : '⬆️ Wyższa (brak)')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(higherMult <= 0),
          new ButtonBuilder()
            .setCustomId('hilo_lower')
            .setLabel(lowerMult > 0 ? `⬇️ Niższa (x${lowerMult.toFixed(2)})` : '⬇️ Niższa (brak)')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(lowerMult <= 0),
          new ButtonBuilder()
            .setCustomId('hilo_cashout')
            .setLabel(canCashout ? `💸 Wypłać $${Math.floor(bet * totalMultiplier).toLocaleString()}` : '💸 Wypłać (po 1. rundzie)')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!canCashout)
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
      time: 120000, // 2 minutes total
      filter: (i) => i.user.id === userId && i.customId.startsWith('hilo_'),
    });

    const onCollect = async (buttonInteraction: ButtonInteraction) => {
      if (settled) return;
      if (buttonInteraction.customId === 'hilo_cashout') {
        if (round <= 1) return;
        settled = true;
        collector.stop();
      }

      // Ack within Discord's 3s window; the DB calls below easily blow past it
      // and would otherwise make update() fail with 10062 Unknown interaction.
      try {
        await buttonInteraction.deferUpdate();
      } catch {
        if (buttonInteraction.customId === 'hilo_cashout') {
          // Already settling — still pay once below.
        } else {
          return;
        }
      }

      if (buttonInteraction.customId === 'hilo_cashout') {
        const winnings = Math.floor(bet * totalMultiplier);
        await client.db.updateMoney(userId, winnings);
        await client.db.recordGame(userId, 'hilo', bet, winnings, 'win');
        const newAchievements = await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        let extra =
          `Wypłacono po **${round - 1}** rundach.\n` +
          `Ostatnia karta: ${formatCard(currentCard)}\n` +
          `Mnożnik: **x${totalMultiplier.toFixed(2)}**`;
        if (newAchievements.length > 0) {
          extra += `\nNowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
        }

        const embed = gameResultEmbed({
          title: 'Hi-Lo',
          won: true,
          bet,
          result: `x${totalMultiplier.toFixed(2)} · $${winnings.toLocaleString()}`,
          balance: newData.money,
          extra,
        });

        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId('d1').setLabel('⬆️ Wyższa').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d2').setLabel('⬇️ Niższa').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d3').setLabel('💸 Wypłacono').setStyle(ButtonStyle.Success).setDisabled(true)
          );

        await buttonInteraction.editReply({ embeds: [embed], components: [disabledRow, hiloPlayAgainRow(bet, userId)] });
        return;
      }

      if (settled) return;

      const direction = buttonInteraction.customId === 'hilo_higher' ? 'higher' : 'lower';
      const nextCard = drawCard();
      const multiplierGain = calculateMultiplier(currentCard, direction);

      // A tie loses. Counting it as a win in *both* directions made low cards
      // ("higher") and aces ("lower") a guaranteed payout.
      const correct = direction === 'higher'
        ? nextCard.rank > currentCard.rank
        : nextCard.rank < currentCard.rank;

      // Guard against a direction that cannot win (ace up / two down). The button
      // is disabled, but a stale message could still deliver the click.
      if (multiplierGain <= 0) {
        await buttonInteraction.followUp({
          embeds: [EmbedHelper.warningEmbed(
            'Hi-Lo',
            'Ten kierunek nie ma żadnej wygrywającej karty — wybierz drugi.',
          )],
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
          `Dobrze. Wylosowano ${formatCard(nextCard)} (${direction === 'higher' ? 'wyższa' : 'niższa'}).\n` +
          `Mnożnik: **x${totalMultiplier.toFixed(2)}**`,
        );

        await buttonInteraction.editReply({ embeds: [embed], components: [buildButtons()] });
      } else {
        settled = true;
        collector.stop();

        await client.db.recordGame(userId, 'hilo', bet, 0, 'loss');
        await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        const embed = gameResultEmbed({
          title: 'Hi-Lo',
          won: false,
          bet,
          result: `Runda ${round} · -$${bet.toLocaleString()}`,
          balance: newData.money,
          extra:
            `Poprzednia: ${formatCard(currentCard)}\n` +
            `Wylosowano: ${formatCard(nextCard)}\n` +
            `Wybrałeś: ${direction === 'higher' ? '⬆️ Wyższa' : '⬇️ Niższa'}`,
        });

        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId('d1').setLabel('⬆️ Wyższa').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d2').setLabel('⬇️ Niższa').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('d3').setLabel('❌ Przegrana').setStyle(ButtonStyle.Danger).setDisabled(true)
          );

        await buttonInteraction.editReply({ embeds: [embed], components: [disabledRow, hiloPlayAgainRow(bet, userId)] });
      }
    };

    collector.on('collect', (buttonInteraction) => {
      onCollect(buttonInteraction).catch((err) => console.error('❌ Hi-Lo collect:', err));
    });

    collector.on('end', async (_collected, reason) => {
      try {
        if (settled) return;
        settled = true;
        if (reason === 'time' && totalMultiplier > 1.0) {
          const winnings = Math.floor(bet * totalMultiplier);
          await client.db.updateMoney(userId, winnings);
          await client.db.recordGame(userId, 'hilo', bet, winnings, 'win');
          const newData = await client.db.getUser(userId);

          const embed = gameResultEmbed({
            title: 'Hi-Lo',
            won: true,
            bet,
            result: `x${totalMultiplier.toFixed(2)} · $${winnings.toLocaleString()}`,
            balance: newData.money,
            extra: 'Czas minął. Auto-wypłata.',
          });
          try { await interaction.editReply({ embeds: [embed], components: [hiloPlayAgainRow(bet, userId)] }); } catch {}
        } else if (reason === 'time') {
          await client.db.recordGame(userId, 'hilo', bet, 0, 'loss');
          const newData = await client.db.getUser(userId);

          const embed = gameResultEmbed({
            title: 'Hi-Lo',
            won: false,
            bet,
            result: 'Czas minął',
            balance: newData.money,
            extra: `Zakład **$${bet.toLocaleString()}** przepadł.`,
          });
          try { await interaction.editReply({ embeds: [embed], components: [hiloPlayAgainRow(bet, userId)] }); } catch {}
        }
      } finally {
        activeHilo.delete(userId);
      }
    });
  },
};
