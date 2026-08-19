import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { BlackjackGame } from '../utils/games';
import { formatUsd, gameResultEmbed, infoGameEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

const activeGames = new Map<string, BlackjackGame>();

function bjPlayAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:blackjack:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
  });
}

function handDetails(game: BlackjackGame, hideDealer = false): Array<[string, string]> {
  const dealer = game.formatHand(game.getDealerHand(), hideDealer)
    + (hideDealer ? '' : ` (**${game.getDealerScore()}**)`);
  return [
    ['Twoja ręka', `${game.formatHand(game.getPlayerHand())} (**${game.getPlayerScore()}**)`],
    ['Krupier', dealer],
  ];
}

function noteExtra(...parts: Array<string | undefined>): string | undefined {
  const lines = parts.filter((p): p is string => Boolean(p && p.trim()));
  return lines.length > 0 ? lines.join('\n') : undefined;
}

export default {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('🃏 Zagraj w blackjacka - cel: 21 punktów!')
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

    if (activeGames.has(userId)) {
      const embed = EmbedHelper.warningEmbed(
        '⚠️ Gra w toku',
        'Dokończ obecną grę w blackjacka zanim zaczniesz nową.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const game = new BlackjackGame();
    activeGames.set(userId, game);

    await client.db.updateMoney(userId, -bet);

    const embed = createGameEmbed(game, bet);
    const buttons = createGameButtons();

    if (game.isPlayerBlackjack()) {
      const winnings = Math.floor(bet * 2.5);
      await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'blackjack', bet, winnings, 'win');
      const newAchievements = await client.db.checkAchievements(userId);
      activeGames.delete(userId);

      const netProfit = winnings - bet;
      const newData = await client.db.getUser(userId);
      const blackjackEmbed = gameResultEmbed({
        title: 'Blackjack',
        won: true,
        bet,
        result: `+$${netProfit.toLocaleString()}`,
        balance: newData.money,
        details: handDetails(game),
        extra: noteExtra(
          'Blackjack · **1.5x** zysku',
          newAchievements.length > 0
            ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
            : undefined,
        ),
      });
      await interaction.reply({ embeds: [blackjackEmbed], components: [bjPlayAgainRow(bet, userId)] });
      return;
    }

    await interaction.reply({ embeds: [embed], components: [buttons] });
    const reply = await interaction.fetchReply();

    const processingInteractions = new Set<string>();
    let settled = false;

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (i: any) => i.user.id === userId
    });

    collector?.on('collect', async (buttonInteraction: any) => {
      if (settled || processingInteractions.has(buttonInteraction.id)) return;
      processingInteractions.add(buttonInteraction.id);

      try {
        if (buttonInteraction.customId === 'hit') {
          if (game.isPlayerBust()) {
            await buttonInteraction.reply({
              content: '❌ Nie możesz już dobierać kart.',
              flags: 64
            });
            return;
          }

          game.hit();

          if (game.isPlayerBust()) {
            settled = true;
            await client.db.recordGame(userId, 'blackjack', bet, 0, 'loss');
            await client.db.checkAchievements(userId);
            activeGames.delete(userId);

            const newData = await client.db.getUser(userId);
            const bustEmbed = gameResultEmbed({
              title: 'Blackjack',
              won: false,
              bet,
              result: `Powyżej 21 · -$${bet.toLocaleString()}`,
              balance: newData.money,
              details: handDetails(game, true),
            });
            await buttonInteraction.update({ embeds: [bustEmbed], components: [bjPlayAgainRow(bet, userId)] });
            collector?.stop();
            return;
          }

          if (game.getPlayerScore() === 21) {
            settled = true;
            game.stand();
            const result = game.getGameResult();

            let resultEmbed: any;
            if (result === 'win') {
              const winAmount = bet * 2;
              await client.db.updateMoney(userId, winAmount);
              await client.db.recordGame(userId, 'blackjack', bet, winAmount, 'win');
              const newAchievements = await client.db.checkAchievements(userId);
              const newData = await client.db.getUser(userId);
              resultEmbed = gameResultEmbed({
                title: 'Blackjack',
                won: true,
                bet,
                result: `+$${bet.toLocaleString()}`,
                balance: newData.money,
                details: handDetails(game),
                extra: noteExtra(
                  'Perfekcyjne 21',
                  newAchievements.length > 0
                    ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
                    : undefined,
                ),
              });
            } else if (result === 'tie') {
              await client.db.updateMoney(userId, bet);
              await client.db.recordGame(userId, 'blackjack', bet, bet, 'tie');
              await client.db.checkAchievements(userId);
              const newData = await client.db.getUser(userId);
              resultEmbed = infoGameEmbed(
                'Blackjack',
                'Remis — zwrot zakładu.',
                { bet, result: 'Remis', balance: newData.money, details: handDetails(game) },
              );
            } else {
              await client.db.recordGame(userId, 'blackjack', bet, 0, 'loss');
              await client.db.checkAchievements(userId);
              const newData = await client.db.getUser(userId);
              resultEmbed = gameResultEmbed({
                title: 'Blackjack',
                won: false,
                bet,
                result: `-$${bet.toLocaleString()}`,
                balance: newData.money,
                details: handDetails(game),
              });
            }

            activeGames.delete(userId);
            await buttonInteraction.update({ embeds: [resultEmbed], components: [bjPlayAgainRow(bet, userId)] });
            collector?.stop();
            return;
          }

          const updatedEmbed = createGameEmbed(game, bet);
          await buttonInteraction.update({ embeds: [updatedEmbed], components: [buttons] });

        } else if (buttonInteraction.customId === 'stand') {
          settled = true;
          game.stand();
          const result = game.getGameResult();

          let resultEmbed: any;
          switch (result) {
            case 'win': {
              const winAmount = bet * 2;
              await client.db.updateMoney(userId, winAmount);
              await client.db.recordGame(userId, 'blackjack', bet, winAmount, 'win');
              const newAchievements = await client.db.checkAchievements(userId);
              const newData = await client.db.getUser(userId);
              resultEmbed = gameResultEmbed({
                title: 'Blackjack',
                won: true,
                bet,
                result: `+$${bet.toLocaleString()}`,
                balance: newData.money,
                details: handDetails(game),
                extra: newAchievements.length > 0
                  ? `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`
                  : undefined,
              });
              break;
            }
            case 'lose': {
              await client.db.recordGame(userId, 'blackjack', bet, 0, 'loss');
              await client.db.checkAchievements(userId);
              const newData = await client.db.getUser(userId);
              resultEmbed = gameResultEmbed({
                title: 'Blackjack',
                won: false,
                bet,
                result: `-$${bet.toLocaleString()}`,
                balance: newData.money,
                details: handDetails(game),
              });
              break;
            }
            case 'tie': {
              await client.db.updateMoney(userId, bet);
              await client.db.recordGame(userId, 'blackjack', bet, bet, 'tie');
              await client.db.checkAchievements(userId);
              const newData = await client.db.getUser(userId);
              resultEmbed = infoGameEmbed(
                'Blackjack',
                'Remis — zwrot zakładu.',
                { bet, result: 'Remis', balance: newData.money, details: handDetails(game) },
              );
              break;
            }
            default:
              resultEmbed = EmbedHelper.errorEmbed('Błąd', 'Coś poszło nie tak.');
          }

          activeGames.delete(userId);
          await buttonInteraction.update({ embeds: [resultEmbed], components: [bjPlayAgainRow(bet, userId)] });
        }
      } catch (error: any) {
        if (error?.code === 10062) return;
        throw error;
      } finally {
        processingInteractions.delete(buttonInteraction.id);
      }
    });

    collector?.on('end', async (collected, reason) => {
      if (reason === 'time' && activeGames.has(userId)) {
        await client.db.recordGame(userId, 'blackjack', bet, 0, 'loss');
        await client.db.checkAchievements(userId);
        activeGames.delete(userId);

        const newData = await client.db.getUser(userId);
        const timeoutEmbed = gameResultEmbed({
          title: 'Blackjack',
          won: false,
          bet,
          result: 'Czas minął',
          balance: newData.money,
          extra: 'Czas minął (2 minuty). Zakład przepadł.',
        });

        try {
          await interaction.editReply({ embeds: [timeoutEmbed], components: [bjPlayAgainRow(bet, userId)] });
        } catch {
          // Ignore error if message was already deleted
        }
      } else {
        activeGames.delete(userId);
      }
    });
  },
};

function createGameEmbed(game: BlackjackGame, bet: number) {
  return pendingEmbed(
    'Blackjack',
    pendingList(
      'Dobierz albo pasuj.',
      [
        ['Twoja ręka', `${game.formatHand(game.getPlayerHand())} (**${game.getPlayerScore()}**)`],
        ['Krupier', game.formatHand(game.getDealerHand(), true)],
        ['Zakład', formatUsd(bet)],
      ],
      'Cel: 21 punktów albo więcej niż krupier.',
    ),
  );
}

function createGameButtons() {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('hit')
        .setLabel('🎴 Dobierz')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId('stand')
        .setLabel('✋ Pasuj')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🛑')
    );
}
