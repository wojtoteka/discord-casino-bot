import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { Deck, Card } from '../utils/games';
import { formatUsd, gameResultEmbed, infoGameEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

function pokerPlayAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:poker:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
  });
}

interface PokerGame {
  playerHand: Card[];
  communityCards: Card[];
  deck: Deck;
  pot: number;
  currentBet: number;
  playerBet: number;
  dealerBet: number;
  stage: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

const activeGames = new Map<string, PokerGame>();

export default {
  data: new SlashCommandBuilder()
    .setName('poker')
    .setDescription('🎩 Zagraj w Texas Hold\'em Poker przeciwko krupierowi')
    .setDescriptionLocalizations(slashLocales("🎩 Texas Hold'em vs the dealer"))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Początkowy zakład (min. $500)')
        .setDescriptionLocalizations(slashLocales('Opening bet (min. $500)'))
        .setRequired(true)
        .setMinValue(500)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
    const userId = interaction.user.id;
    
    const lang = await getUserLang(client.db, userId);
    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet * 2)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'poker_need')(bet * 2, userData.money),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    if (activeGames.has(userId)) {
      const embed = EmbedHelper.warningEmbed(
        t(lang, 'game_in_progress_title'),
        t(lang, 'game_in_progress'),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    // Start game
    const deck = new Deck();
    const playerHand: Card[] = [deck.drawCard()!, deck.drawCard()!];
    const dealerHand: Card[] = [deck.drawCard()!, deck.drawCard()!];
    
    const game: PokerGame = {
      playerHand,
      communityCards: [],
      deck,
      pot: bet * 2,
      currentBet: bet,
      playerBet: bet,
      dealerBet: bet,
      stage: 'preflop'
    };

    activeGames.set(userId, game);
    try {
      await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
    } catch (error) {
      activeGames.delete(userId);
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

    const embed = createPokerEmbed(game, false);
    const buttons = createPokerButtons(game);

    await interaction.reply({ embeds: [embed], components: [buttons] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 180000, // 3 minuty
      filter: (i: any) => i.user.id === userId
    });

    collector?.on('collect', async (buttonInteraction: any) => {
      try {
      const game = activeGames.get(userId);
      if (!game) return;

      if (buttonInteraction.customId === 'fold') {
        // Fold - lose
        await client.db.recordGame(userId, 'poker', game.playerBet, 0, 'loss');
        await client.db.checkAchievements(userId);
        activeGames.delete(userId);
        const foldBalance = (await client.db.getUser(userId)).money;
        const foldEmbed = gameResultEmbed({
          title: 'Poker',
          won: false,
          bet: game.playerBet,
          result: `Pas · -$${game.playerBet.toLocaleString()}`,
          balance: foldBalance,
          details: [
            ['Twoja ręka', formatHand(game.playerHand)],
            ['Stół', game.communityCards.length > 0 ? formatHand(game.communityCards) : 'brak'],
          ],
        });
        await buttonInteraction.update({ embeds: [foldEmbed], components: [pokerPlayAgainRow(bet, userId)] });
        collector?.stop();
        return;
      }

      if (buttonInteraction.customId === 'call') {
        // Advance to next stage
        if (game.stage === 'preflop') {
          // Flop - reveal 3 cards
          game.communityCards.push(deck.drawCard()!, deck.drawCard()!, deck.drawCard()!);
          game.stage = 'flop';
        } else if (game.stage === 'flop') {
          // Turn - reveal 4th card
          game.communityCards.push(deck.drawCard()!);
          game.stage = 'turn';
        } else if (game.stage === 'turn') {
          // River - reveal 5th card
          game.communityCards.push(deck.drawCard()!);
          game.stage = 'river';
        } else if (game.stage === 'river') {
          // Showdown
          game.stage = 'showdown';
          await handleShowdown(buttonInteraction, client, userId, game, dealerHand, bet);
          collector?.stop();
          return;
        }

        const updatedEmbed = createPokerEmbed(game, false);
        const updatedButtons = createPokerButtons(game);
        await buttonInteraction.update({ embeds: [updatedEmbed], components: [updatedButtons] });
      }

      if (buttonInteraction.customId === 'raise') {
        // Raise bet
        const raiseAmount = Math.floor(bet * 0.5);
        
        const currentUserData = await client.db.getUser(userId);
        if (!GameHelper.canAfford(currentUserData.money, raiseAmount)) {
          await buttonInteraction.reply({
            content: t(lang, 'poker_raise_broke')(raiseAmount),
            flags: 64,
          });
          return;
        }

        try {
          await withUserLock(userId, () => client.db.updateMoney(userId, -raiseAmount));
        } catch (error) {
          if (error instanceof InsufficientFundsError) {
            const latest = await client.db.getUser(userId);
            await buttonInteraction.reply({
              content: t(lang, 'poker_raise_broke')(raiseAmount),
              flags: 64,
            });
            return;
          }
          throw error;
        }
        game.pot += raiseAmount;
        game.playerBet += raiseAmount;
        game.currentBet += raiseAmount;

        // Dealer calls (simplified AI)
        game.pot += raiseAmount;
        game.dealerBet += raiseAmount;

        const updatedEmbed = createPokerEmbed(game, false);
        const updatedButtons = createPokerButtons(game);
        await buttonInteraction.update({ embeds: [updatedEmbed], components: [updatedButtons] });
      }
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          await buttonInteraction.reply({
            content: t(lang, 'poker_raise_broke')(error.needed),
            flags: 64,
          }).catch(() => {});
          return;
        }
        throw error;
      }
    });

    collector?.on('end', async (_collected, reason) => {
      if (reason === 'time' && activeGames.has(userId)) {
        const g = activeGames.get(userId);
        const lostBet = g?.playerBet ?? bet;
        activeGames.delete(userId);
        await withUserLock(userId, () => client.db.recordGame(userId, 'poker', lostBet, 0, 'loss')).catch(() => {});
        const timeoutEmbed = EmbedHelper.warningEmbed(
          t(lang, 'poker_title'),
          t(lang, 'poker_timeout')(lostBet),
        );
        try {
          await interaction.editReply({ embeds: [timeoutEmbed], components: [pokerPlayAgainRow(bet, userId)] });
        } catch {
          // Ignore
        }
      } else {
        activeGames.delete(userId);
      }
    });

    // Store dealer hand for later
    (game as any).dealerHand = dealerHand;
  },
};

async function handleShowdown(
  interaction: any,
  client: CasinoBot,
  userId: string,
  game: PokerGame,
  dealerHand: Card[],
  bet: number
) {
  activeGames.delete(userId);

  const playerScore = evaluateHand(game.playerHand, game.communityCards);
  const dealerScore = evaluateHand(dealerHand, game.communityCards);

  let resultEmbed: any;

  if (playerScore.rank > dealerScore.rank) {
    // Player wins
    await client.db.updateMoney(userId, game.pot);
    await client.db.recordGame(userId, 'poker', game.playerBet, game.pot, 'win');
    const newAchievements = await client.db.checkAchievements(userId);
    const profit = game.pot - game.playerBet;
    const winBalance = (await client.db.getUser(userId)).money;
    resultEmbed = gameResultEmbed({
      title: 'Poker',
      won: true,
      bet: game.playerBet,
      result: `+$${profit.toLocaleString()}`,
      balance: winBalance,
      details: [
        ['Układ', playerScore.name],
        ['Twoja ręka', formatHand(game.playerHand)],
        ['Krupier', `${formatHand(dealerHand)} - ${dealerScore.name}`],
        ['Stół', formatHand(game.communityCards)],
        ['Pula', formatUsd(game.pot)],
      ],
      extra: newAchievements.length > 0
        ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
        : undefined,
    });
  } else if (playerScore.rank < dealerScore.rank) {
    // Dealer wins
    await client.db.recordGame(userId, 'poker', game.playerBet, 0, 'loss');
    await client.db.checkAchievements(userId);
    const loseBalance = (await client.db.getUser(userId)).money;
    resultEmbed = gameResultEmbed({
      title: 'Poker',
      won: false,
      bet: game.playerBet,
      result: `-$${game.playerBet.toLocaleString()}`,
      balance: loseBalance,
      details: [
        ['Krupier', dealerScore.name],
        ['Twoja ręka', `${formatHand(game.playerHand)} - ${playerScore.name}`],
        ['Karty krupiera', formatHand(dealerHand)],
        ['Stół', formatHand(game.communityCards)],
      ],
    });
  } else {
    // Tie - return bet
    await client.db.updateMoney(userId, game.playerBet);
    await client.db.recordGame(userId, 'poker', game.playerBet, game.playerBet, 'tie');
    await client.db.checkAchievements(userId);
    const tieBalance = (await client.db.getUser(userId)).money;
    resultEmbed = infoGameEmbed(
      'Poker',
      'Remis - zakład zwrócony.',
      {
        bet: game.playerBet,
        result: 'Remis',
        balance: tieBalance,
        details: [
          ['Twoja ręka', `${formatHand(game.playerHand)} - ${playerScore.name}`],
          ['Krupier', `${formatHand(dealerHand)} - ${dealerScore.name}`],
          ['Stół', formatHand(game.communityCards)],
        ],
      },
    );
  }

  await interaction.update({ embeds: [resultEmbed], components: [pokerPlayAgainRow(bet, userId)] });
}

function createPokerEmbed(game: PokerGame, _showDealer: boolean) {
  const table = game.communityCards.length > 0
    ? formatHand(game.communityCards)
    : 'jeszcze nieujawnione';

  return pendingEmbed(
    'Poker',
    pendingList(
      game.stage !== 'showdown' ? 'Sprawdź · Podbij · Pas' : 'Rozstrzygnięcie.',
      [
        ['Twoje karty', formatHand(game.playerHand)],
        ['Stół', table],
        ['Pula', formatUsd(game.pot)],
        ['Twój zakład', formatUsd(game.playerBet)],
        ['Etap', getStageNamePolish(game.stage)],
      ],
    ),
  );
}

function createPokerButtons(game: PokerGame): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('call')
        .setLabel(game.stage === 'river' ? '🎯 Rozstrzygnięcie' : '✅ Sprawdź')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('raise')
        .setLabel('💰 Podbij')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(game.stage === 'river'),
      new ButtonBuilder()
        .setCustomId('fold')
        .setLabel('🏳️ Pas')
        .setStyle(ButtonStyle.Danger)
    );
}

function formatHand(cards: Card[]): string {
  return cards.map(card => `${card.name}${card.suit}`).join(' ');
}

function getStageNamePolish(stage: string): string {
  const stages: { [key: string]: string } = {
    'preflop': 'Pre-Flop (przed flopem)',
    'flop': 'Flop (3 karty wspólne)',
    'turn': 'Turn (4 karty wspólne)',
    'river': 'River (5 kart wspólnych)',
    'showdown': 'Showdown (rozstrzygnięcie)'
  };
  return stages[stage] || stage;
}

function evaluateHand(hand: Card[], community: Card[]): { rank: number; name: string } {
  const allCards = [...hand, ...community];
  
  // Simplified poker hand evaluation
  const values = allCards.map(c => c.value).sort((a, b) => b - a);
  const suits = allCards.map(c => c.suit);
  
  // Check for flush
  const suitCounts: { [key: string]: number } = {};
  suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
  const hasFlush = Object.values(suitCounts).some(count => count >= 5);
  
  // Check for pairs, three of a kind, etc.
  const valueCounts: { [key: number]: number } = {};
  values.forEach(v => valueCounts[v] = (valueCounts[v] || 0) + 1);
  const counts = Object.values(valueCounts).sort((a, b) => b - a);
  
  if (hasFlush && isSequential(values)) {
    return { rank: 9, name: 'Poker (Straight Flush)' };
  }
  if (counts[0] === 4) {
    return { rank: 8, name: 'Kareta (Four of a Kind)' };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: 7, name: 'Full House' };
  }
  if (hasFlush) {
    return { rank: 6, name: 'Kolor (Flush)' };
  }
  if (isSequential(values)) {
    return { rank: 5, name: 'Strit (Straight)' };
  }
  if (counts[0] === 3) {
    return { rank: 4, name: 'Trójka (Three of a Kind)' };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: 3, name: 'Dwie Pary (Two Pair)' };
  }
  if (counts[0] === 2) {
    return { rank: 2, name: 'Para (Pair)' };
  }
  
  return { rank: 1, name: `Wysoka Karta (${getCardName(values[0])})` };
}

function isSequential(values: number[]): boolean {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length < 5) return false;
  
  for (let i = 0; i <= unique.length - 5; i++) {
    let sequential = true;
    for (let j = 0; j < 4; j++) {
      if (unique[i + j + 1] - unique[i + j] !== 1) {
        sequential = false;
        break;
      }
    }
    if (sequential) return true;
  }
  return false;
}

function getCardName(value: number): string {
  if (value === 1 || value === 11) return 'As';
  if (value === 10) return 'Król/Dama/Walet';
  return value.toString();
}
