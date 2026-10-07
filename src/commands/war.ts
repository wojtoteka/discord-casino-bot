import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome, symbolLabel } from '../utils/gameView';
import { renderWar, suitFromSymbol, safeRender } from '../render';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_MAP: { [key: string]: number } = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const activeWar = new Set<string>();

function drawCard(): { value: string; suit: string; rank: number } {
  const value = VALUES[Math.floor(Math.random() * VALUES.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { value, suit, rank: VALUE_MAP[value] };
}

function face(card: { value: string; suit: string }) {
  return { rank: card.value, suit: suitFromSymbol(card.suit) };
}

function formatCard(card: { value: string; suit: string }): string {
  return `**${card.suit} ${card.value}**`;
}

function warAgainRow(bet: number, userId: string, lang: 'pl' | 'en') {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:war:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    playAgainLabel: t(lang, 'btn_play_again'),
    balanceLabel: t(lang, 'btn_balance'),
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('war')
    .setDescription('🎴 Wojna karciana - Twoja karta vs krupiera!')
    .setDescriptionLocalizations(slashLocales('🎴 Card war - your card vs the dealer'))
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

    if (activeWar.has(userId)) {
      await interaction.reply({
        embeds: [EmbedHelper.warningEmbed(t(lang, 'game_in_progress_title'), t(lang, 'game_in_progress'))],
        flags: 64,
      });
      return;
    }

    activeWar.add(userId);
    try {
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

      const view = async (kind: 'win' | 'loss' | 'pending', parts: {
        player: ReturnType<typeof drawCard> | null;
        dealer: ReturnType<typeof drawCard> | null;
        tied?: { player: ReturnType<typeof drawCard>; dealer: ReturnType<typeof drawCard> };
        outcome: Parameters<typeof renderWar>[0]['outcome'];
        summary: string;
        components?: ReturnType<typeof warAgainRow>[];
        achievements?: string[];
      }) => gameView({
        lang,
        title: t(lang, 'war_title'),
        kind,
        image: await safeRender('war', () => renderWar({
          player: parts.player ? face(parts.player) : null,
          dealer: parts.dealer ? face(parts.dealer) : null,
          youLabel: t(lang, 'card_you'),
          dealerLabel: t(lang, 'card_dealer'),
          tied: parts.tied
            ? { player: face(parts.tied.player), dealer: face(parts.tied.dealer), label: t(lang, 'card_war_tied')(parts.tied.player.value) }
            : undefined,
          winner: kind === 'win' ? 'player' : kind === 'loss' ? 'dealer' : undefined,
          outcome: parts.outcome,
        })),
        imageName: 'war',
        summary: parts.summary,
        fallback: parts.player && parts.dealer ? `${formatCard(parts.player)} vs ${formatCard(parts.dealer)}` : undefined,
        achievements: parts.achievements,
        components: parts.components,
      });

      await interaction.editReply(await view('pending', {
        player: null,
        dealer: null,
        outcome: pendingOutcome(t(lang, 'card_dealing'), [[t(lang, 'label_bet'), formatUsd(bet)]]),
        summary: t(lang, 'war_dealing'),
      }));
      await new Promise(r => setTimeout(r, 1000));

      const playerCard = drawCard();
      const dealerCard = drawCard();
      const row = warAgainRow(bet, userId, lang);
      const winMulti = GAMES.war.winMultiplier;
      const tieMulti = GAMES.war.tieMultiplier;

      if (playerCard.rank === dealerCard.rank) {
        await interaction.editReply(await view('pending', {
          player: playerCard,
          dealer: dealerCard,
          outcome: pendingOutcome(t(lang, 'card_war_tied')(playerCard.value), [[t(lang, 'label_bet'), formatUsd(bet * 2)]]),
          summary: t(lang, 'war_war_incoming')(bet * 2),
        }));
        await new Promise(r => setTimeout(r, 1500));

        let matched = true;
        try {
          await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
        } catch (error) {
          if (error instanceof InsufficientFundsError) {
            matched = false;
          } else {
            throw error;
          }
        }

        if (!matched) {
          await withUserLock(userId, async () => {
            await client.db.recordGame(userId, 'war', bet, 0, 'loss');
            await client.db.updateQuestProgress(userId, { play_games: 1, wager: bet });
          });
          await client.db.checkAchievements(userId);
          const newData = await client.db.getUser(userId);
          await interaction.editReply(await view('loss', {
            player: playerCard,
            dealer: dealerCard,
            outcome: settledOutcome({ lang, kind: 'loss', net: -bet, bet, balance: newData.money }),
            summary: t(lang, 'war_cant_match'),
            components: [row],
          }));
          return;
        }

        const warPlayerCard = drawCard();
        const warDealerCard = drawCard();
        const warWon = warPlayerCard.rank >= warDealerCard.rank;
        const totalBet = bet * 2;
        const payout = warWon ? bet * tieMulti : 0;

        await withUserLock(userId, async () => {
          if (warWon) await client.db.updateMoney(userId, payout);
          await client.db.recordGame(userId, 'war', totalBet, payout, warWon ? 'win' : 'loss');
          await client.db.updateQuestProgress(userId, {
            play_games: 1,
            wager: totalBet,
            ...(warWon ? { win_games: 1 } : {}),
          });
        });
        const newAchievements = await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        await interaction.editReply(await view(warWon ? 'win' : 'loss', {
          player: warPlayerCard,
          dealer: warDealerCard,
          tied: { player: playerCard, dealer: dealerCard },
          outcome: settledOutcome({ lang, kind: warWon ? 'win' : 'loss', net: payout - totalBet, bet: totalBet, balance: newData.money }),
          summary: warWon ? t(lang, 'war_win')(bet, tieMulti) : t(lang, 'war_loss')(totalBet),
          achievements: warWon ? newAchievements : undefined,
          components: [row],
        }));
        return;
      }

      const won = playerCard.rank > dealerCard.rank;
      const payout = won ? bet * winMulti : 0;

      await withUserLock(userId, async () => {
        if (won) await client.db.updateMoney(userId, payout);
        await client.db.recordGame(userId, 'war', bet, payout, won ? 'win' : 'loss');
        await client.db.updateQuestProgress(userId, {
          play_games: 1,
          wager: bet,
          ...(won ? { win_games: 1 } : {}),
        });
      });
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      await interaction.editReply(await view(won ? 'win' : 'loss', {
        player: playerCard,
        dealer: dealerCard,
        outcome: settledOutcome({ lang, kind: won ? 'win' : 'loss', net: payout - bet, bet, balance: newData.money }),
        summary: won ? t(lang, 'war_win')(bet, winMulti) : t(lang, 'war_loss')(bet),
        achievements: won ? newAchievements : undefined,
        components: [row],
      }));
    } finally {
      activeWar.delete(userId);
    }
  },
};
