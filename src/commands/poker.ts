import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonInteraction } from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { Deck, Card } from '../utils/games';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';
import { gameView, pendingOutcome, settledOutcome } from '../utils/gameView';
import { renderPokerTable, safeRender, suitFromSymbol, type CardFace, type CardOutcome } from '../render';

/* ── Hand evaluation (Texas Hold'em, best five of seven) ─────────── */

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};
const RANK_NAME: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export interface HandScore {
  /** 0 high card … 8 straight flush. */
  category: number;
  /** Category first, then tie-breakers - compared left to right. */
  score: number[];
  /** Ranks for the localised name. */
  ranks: number[];
}

function straightHigh(values: number[]): number | null {
  const set = new Set(values);
  if (set.has(14)) set.add(1); // the wheel: A-2-3-4-5
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!set.has(high - k)) { ok = false; break; }
    }
    if (ok) return high;
  }
  return null;
}

export function evaluateHand(cards: Card[]): HandScore {
  const parsed = cards.map(c => ({ v: RANK_VALUE[c.name] ?? 0, s: c.suit }));
  const bySuit = new Map<string, number[]>();
  const counts = new Map<number, number>();
  for (const { v, s } of parsed) {
    bySuit.set(s, [...(bySuit.get(s) ?? []), v]);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const values = parsed.map(p => p.v).sort((a, b) => b - a);

  const flushValues = [...bySuit.values()].find(vs => vs.length >= 5)?.sort((a, b) => b - a);
  if (flushValues) {
    const sf = straightHigh(flushValues);
    if (sf) return { category: 8, score: [8, sf], ranks: [sf] };
  }

  // Groups sorted by size, then rank: [[rank, count], …]
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kickers = (exclude: number[], n: number) => values.filter(v => !exclude.includes(v)).slice(0, n);

  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    return { category: 7, score: [7, quad, ...kickers([quad], 1)], ranks: [quad] };
  }
  const trips = groups.filter(g => g[1] === 3).map(g => g[0]);
  const pairs = groups.filter(g => g[1] === 2).map(g => g[0]);
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const top = trips[0];
    const second = trips.length > 1 ? trips[1] : pairs[0];
    return { category: 6, score: [6, top, second], ranks: [top, second] };
  }
  if (flushValues) {
    const five = flushValues.slice(0, 5);
    return { category: 5, score: [5, ...five], ranks: [five[0]] };
  }
  const st = straightHigh(values);
  if (st) return { category: 4, score: [4, st], ranks: [st] };
  if (trips.length > 0) {
    return { category: 3, score: [3, trips[0], ...kickers([trips[0]], 2)], ranks: [trips[0]] };
  }
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return { category: 2, score: [2, a, b, ...kickers([a, b], 1)], ranks: [a, b] };
  }
  if (pairs.length === 1) {
    return { category: 1, score: [1, pairs[0], ...kickers([pairs[0]], 3)], ranks: [pairs[0]] };
  }
  return { category: 0, score: [0, ...values.slice(0, 5)], ranks: [values[0]] };
}

export function compareHands(a: HandScore, b: HandScore): number {
  for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) {
    const d = (a.score[i] ?? 0) - (b.score[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function handName(lang: Lang, hand: HandScore): string {
  const [r1, r2] = hand.ranks.map(r => RANK_NAME[r] ?? String(r));
  switch (hand.category) {
    case 8: return hand.ranks[0] === 14 ? t(lang, 'poker_hand_royal') : t(lang, 'poker_hand_straight_flush')(r1);
    case 7: return t(lang, 'poker_hand_quads')(r1);
    case 6: return t(lang, 'poker_hand_full')(r1, r2);
    case 5: return t(lang, 'poker_hand_flush')(r1);
    case 4: return t(lang, 'poker_hand_straight')(r1);
    case 3: return t(lang, 'poker_hand_trips')(r1);
    case 2: return t(lang, 'poker_hand_two_pair')(r1, r2);
    case 1: return t(lang, 'poker_hand_pair')(r1);
    default: return t(lang, 'poker_hand_high')(r1);
  }
}

/* ── Game ────────────────────────────────────────────────────────── */

type Stage = 'preflop' | 'flop' | 'turn' | 'river';

interface PokerGame {
  playerHand: Card[];
  dealerHand: Card[];
  communityCards: Card[];
  deck: Deck;
  pot: number;
  playerBet: number;
  stage: Stage;
}

const activeGames = new Map<string, PokerGame>();
const DECISION_MS = 180_000;

function face(card: Card): CardFace {
  return { rank: card.name, suit: suitFromSymbol(card.suit) };
}

function formatHand(cards: Card[]): string {
  return cards.map(card => `${card.name}${card.suit}`).join(' ');
}

function pokerPlayAgainRow(bet: number, userId: string, lang: Lang) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:poker:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    playAgainLabel: t(lang, 'btn_play_again'),
    balanceLabel: t(lang, 'btn_balance'),
  });
}

function decisionRow(lang: Lang, game: PokerGame, raiseAmount: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('call')
      .setLabel(game.stage === 'river' ? t(lang, 'poker_btn_showdown') : t(lang, 'poker_btn_call'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('raise')
      .setLabel(t(lang, 'poker_btn_raise')(formatUsd(raiseAmount)))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(game.stage === 'river'),
    new ButtonBuilder()
      .setCustomId('fold')
      .setLabel(t(lang, 'poker_btn_fold'))
      .setStyle(ButtonStyle.Danger),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('poker')
    .setDescription("🎩 Texas Hold'em przeciwko krupierowi")
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
    const raiseAmount = Math.floor(bet * 0.5);

    if (!GameHelper.canAfford(userData.money, bet * 2)) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'insufficient_funds_title'), t(lang, 'poker_need')(bet * 2, userData.money))],
        flags: 64,
      });
      return;
    }
    if (activeGames.has(userId)) {
      await interaction.reply({
        embeds: [EmbedHelper.warningEmbed(t(lang, 'game_in_progress_title'), t(lang, 'game_in_progress'))],
        flags: 64,
      });
      return;
    }

    const deck = new Deck();
    const game: PokerGame = {
      playerHand: [deck.drawCard()!, deck.drawCard()!],
      dealerHand: [deck.drawCard()!, deck.drawCard()!],
      communityCards: [],
      deck,
      pot: bet * 2,
      playerBet: bet,
      stage: 'preflop',
    };

    activeGames.set(userId, game);
    try {
      await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
    } catch (error) {
      activeGames.delete(userId);
      if (error instanceof InsufficientFundsError) {
        const latest = await client.db.getUser(userId);
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(t(lang, 'insufficient_funds_title'), t(lang, 'error_insufficient_funds')(bet, latest.money))],
          flags: 64,
        });
        return;
      }
      throw error;
    }

    const stageLabel = () => t(lang, `poker_stage_${game.stage}` as 'poker_stage_flop');
    const playerScore = () => game.communityCards.length + 2 >= 5 ? evaluateHand([...game.playerHand, ...game.communityCards]) : null;

    const view = async (params: {
      kind: 'win' | 'loss' | 'push' | 'pending';
      outcome: CardOutcome;
      summary: string;
      showdown?: { player: HandScore; dealer: HandScore };
      components: Array<ActionRowBuilder<ButtonBuilder>>;
    }) => {
      const live = playerScore();
      return gameView({
        lang,
        title: t(lang, 'poker_title'),
        kind: params.kind,
        image: await safeRender('poker', () => renderPokerTable({
          player: game.playerHand.map(face),
          dealer: params.showdown ? game.dealerHand.map(face) : [null, null],
          community: game.communityCards.map(face),
          playerHandName: params.showdown ? handName(lang, params.showdown.player) : live ? handName(lang, live) : undefined,
          dealerHandName: params.showdown ? handName(lang, params.showdown.dealer) : undefined,
          youLabel: t(lang, 'card_you'),
          dealerLabel: t(lang, 'card_dealer'),
          winner: params.kind === 'win' ? 'player' : params.kind === 'loss' ? 'dealer' : params.kind === 'push' ? 'push' : undefined,
          outcome: params.outcome,
        })),
        imageName: 'poker',
        summary: params.summary,
        fallback: `${t(lang, 'poker_your_hand')}: ${formatHand(game.playerHand)}\n${t(lang, 'poker_table')}: ${game.communityCards.length ? formatHand(game.communityCards) : t(lang, 'poker_none')}`,
        components: params.components,
      });
    };

    const playingView = () => view({
      kind: 'pending',
      outcome: pendingOutcome(stageLabel(), [
        [t(lang, 'card_pot'), formatUsd(game.pot)],
        [t(lang, 'card_your_bet'), formatUsd(game.playerBet)],
      ]),
      summary: t(lang, 'poker_prompt'),
      components: [decisionRow(lang, game, raiseAmount)],
    });

    await interaction.reply(await playingView());
    const reply = await interaction.fetchReply();

    let busy = false;
    let finished = false;
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: DECISION_MS,
      filter: (i: ButtonInteraction) => i.user.id === userId && ['call', 'raise', 'fold'].includes(i.customId),
    });

    const finishFold = async (respond: (p: Awaited<ReturnType<typeof view>>) => Promise<unknown>, summary: string) => {
      finished = true;
      activeGames.delete(userId);
      await withUserLock(userId, () => client.db.recordGame(userId, 'poker', game.playerBet, 0, 'loss'));
      await client.db.checkAchievements(userId);
      const balance = (await client.db.getUser(userId)).money;
      await respond(await view({
        kind: 'loss',
        outcome: settledOutcome({ lang, kind: 'loss', net: -game.playerBet, bet: game.playerBet, balance }),
        summary,
        components: [pokerPlayAgainRow(bet, userId, lang)],
      }));
    };

    const showdown = async (button: ButtonInteraction) => {
      finished = true;
      activeGames.delete(userId);
      const player = evaluateHand([...game.playerHand, ...game.communityCards]);
      const dealer = evaluateHand([...game.dealerHand, ...game.communityCards]);
      const diff = compareHands(player, dealer);
      const kind = diff > 0 ? 'win' : diff < 0 ? 'loss' : 'push';
      const payout = kind === 'win' ? game.pot : kind === 'push' ? game.playerBet : 0;

      await withUserLock(userId, async () => {
        if (payout > 0) await client.db.updateMoney(userId, payout);
        await client.db.recordGame(userId, 'poker', game.playerBet, payout, kind === 'push' ? 'tie' : kind);
      });
      const achievements = await client.db.checkAchievements(userId);
      const balance = (await client.db.getUser(userId)).money;
      const summary = kind === 'win'
        ? t(lang, 'poker_won')(handName(lang, player), formatUsd(payout - game.playerBet))
        : kind === 'loss'
          ? t(lang, 'poker_lost')(handName(lang, dealer))
          : t(lang, 'poker_split')(handName(lang, player));
      const payload = await view({
        kind,
        outcome: settledOutcome({
          lang,
          kind,
          net: payout - game.playerBet,
          bet: game.playerBet,
          balance,
          rows: [[t(lang, 'card_pot'), formatUsd(game.pot)]],
        }),
        summary,
        showdown: { player, dealer },
        components: [pokerPlayAgainRow(bet, userId, lang)],
      });
      if (achievements.length > 0) {
        const { formatAchievementNamesInline } = await import('../utils/achievements');
        payload.embeds[0].setDescription(`${summary}\n${t(lang, 'new_achievements')(formatAchievementNamesInline(achievements)).trim()}`);
      }
      await button.update(payload);
    };

    collector.on('collect', async (button: ButtonInteraction) => {
      if (finished || busy) {
        await button.deferUpdate().catch(() => {});
        return;
      }
      busy = true;
      try {
        if (button.customId === 'fold') {
          await finishFold(p => button.update(p), t(lang, 'poker_folded')(formatUsd(game.playerBet)));
          collector.stop('done');
          return;
        }

        if (button.customId === 'raise') {
          try {
            await withUserLock(userId, () => client.db.updateMoney(userId, -raiseAmount));
          } catch (error) {
            if (error instanceof InsufficientFundsError) {
              await button.reply({ content: t(lang, 'poker_raise_broke')(raiseAmount), flags: 64 });
              return;
            }
            throw error;
          }
          // The dealer always calls a raise.
          game.playerBet += raiseAmount;
          game.pot += raiseAmount * 2;
          await button.update(await playingView());
          return;
        }

        // call
        if (game.stage === 'preflop') {
          game.communityCards.push(deck.drawCard()!, deck.drawCard()!, deck.drawCard()!);
          game.stage = 'flop';
        } else if (game.stage === 'flop') {
          game.communityCards.push(deck.drawCard()!);
          game.stage = 'turn';
        } else if (game.stage === 'turn') {
          game.communityCards.push(deck.drawCard()!);
          game.stage = 'river';
        } else {
          await showdown(button);
          collector.stop('done');
          return;
        }
        await button.update(await playingView());
      } catch (error: any) {
        if (error?.code === 10062) return;
        console.error('[ROYALCASINO] Poker:', error);
      } finally {
        busy = false;
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason !== 'time' || finished || !activeGames.has(userId)) {
        if (finished) activeGames.delete(userId);
        return;
      }
      await finishFold(p => interaction.editReply(p), t(lang, 'poker_timeout')(game.playerBet)).catch(() => {
        activeGames.delete(userId);
      });
    });
  },
};
