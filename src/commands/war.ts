import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
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

function warAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:war:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('war')
    .setDescription('⚔️ Wojna karciana - Twoja karta vs krupiera!')
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

    await interaction.deferReply();

    await interaction.editReply({
      embeds: [pendingEmbed(
        'Wojna',
        pendingList('Rozdaję karty...', [['Zakład', formatUsd(bet)]]),
      )],
    });
    await new Promise(r => setTimeout(r, 1200));

    const playerCard = drawCard();
    const dealerCard = drawCard();
    const row = warAgainRow(bet, userId);

    if (playerCard.rank === dealerCard.rank) {
      await interaction.editReply({
        embeds: [pendingEmbed(
          'Wojna',
          pendingList(
            'Remis — zaczyna się wojna.',
            [
              ['Ty', formatCard(playerCard)],
              ['Krupier', formatCard(dealerCard)],
              ['Nowy zakład', formatUsd(bet * 2)],
            ],
          ),
        )],
      });
      await new Promise(r => setTimeout(r, 1500));

      const warPlayerCard = drawCard();
      const warDealerCard = drawCard();

      if (warPlayerCard.rank >= warDealerCard.rank) {
        const winnings = bet * 3;
        await client.db.updateMoney(userId, winnings);
        await client.db.recordGame(userId, 'war', bet, winnings + bet, 'win');
        await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, wager: bet });
        const newAchievements = await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        let extra =
          `Runda: ${formatCard(playerCard)} vs ${formatCard(dealerCard)} → remis\n` +
          `Wojna: ${formatCard(warPlayerCard)} vs ${formatCard(warDealerCard)}`;
        if (newAchievements.length > 0) {
        if (newAchievements.length > 0) {
          extra += `\nNowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
        }
        }

        const embed = gameResultEmbed({
          title: 'Wojna',
          won: true,
          bet,
          result: `+$${winnings.toLocaleString()} (3x)`,
          balance: newData.money,
          extra,
        });
        await interaction.editReply({ embeds: [embed], components: [row] });
      } else {
        await client.db.updateMoney(userId, -bet);
        await client.db.recordGame(userId, 'war', bet, 0, 'loss');
        await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
        await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        const embed = gameResultEmbed({
          title: 'Wojna',
          won: false,
          bet,
          result: `-$${bet.toLocaleString()}`,
          balance: newData.money,
          extra:
            `Runda: ${formatCard(playerCard)} vs ${formatCard(dealerCard)} → remis\n` +
            `Wojna: ${formatCard(warPlayerCard)} vs ${formatCard(warDealerCard)}`,
        });
        await interaction.editReply({ embeds: [embed], components: [row] });
      }
    } else if (playerCard.rank > dealerCard.rank) {
      const winnings = bet;
      await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'war', bet, bet * 2, 'win');
      await client.db.updateQuestProgress(userId, { win_games: 1, play_games: 1, wager: bet });
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      let extra = `Ty: ${formatCard(playerCard)}\nKrupier: ${formatCard(dealerCard)}`;
      if (newAchievements.length > 0) {
        extra += `\nNowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
      }

      const embed = gameResultEmbed({
        title: 'Wojna',
        won: true,
        bet,
        result: `+$${winnings.toLocaleString()}`,
        balance: newData.money,
        extra,
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await client.db.updateMoney(userId, -bet);
      await client.db.recordGame(userId, 'war', bet, 0, 'loss');
      await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
      await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      const embed = gameResultEmbed({
        title: 'Wojna',
        won: false,
        bet,
        result: `-$${bet.toLocaleString()}`,
        balance: newData.money,
        extra: `Ty: ${formatCard(playerCard)}\nKrupier: ${formatCard(dealerCard)}`,
      });
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  },
};
