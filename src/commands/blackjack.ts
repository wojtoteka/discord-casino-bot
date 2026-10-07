import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { BlackjackGame, type Card } from '../utils/games';
import { brandTitle, formatUsd, playAgainRow } from '../utils/embeds';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';
import { COLORS, GAMES } from '../config/constants';
import {
  imageAttachment, renderBlackjackTable, safeRender, suitFromSymbol,
  type BlackjackOutcome, type CardFace,
} from '../render';

const activeGames = new Map<string, BlackjackGame>();
const DECISION_MS = 120_000;

function face(card: Card): CardFace {
  return { rank: card.name, suit: suitFromSymbol(card.suit) };
}

function bjPlayAgainRow(bet: number, userId: string, lang: Lang) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:blackjack:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    playAgainLabel: t(lang, 'btn_play_again'),
    balanceLabel: t(lang, 'btn_balance'),
  });
}

function decisionRow(lang: Lang, canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hit').setLabel(t(lang, 'bj_hit')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stand').setLabel(t(lang, 'bj_stand')).setStyle(ButtonStyle.Success),
  );
  if (canDouble) {
    row.addComponents(
      new ButtonBuilder().setCustomId('double').setLabel(t(lang, 'bj_double')).setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

interface TableState {
  game: BlackjackGame;
  bet: number;
  doubled: boolean;
  outcome?: { kind: BlackjackOutcome; net: number };
}

async function tablePayload(
  state: TableState,
  lang: Lang,
  opts: { description: string; color: number; components: ActionRowBuilder<ButtonBuilder>[]; balance?: number },
) {
  const { game } = state;
  const settled = Boolean(state.outcome);
  const image = await safeRender('blackjack', () => renderBlackjackTable({
    dealer: game.getDealerHand().map((card, i) => (!settled && i === 0 ? null : face(card))),
    player: game.getPlayerHand().map(face),
    dealerScore: settled ? String(game.getDealerScore()) : '?',
    playerScore: String(game.getPlayerScore()),
    bet: state.bet,
    doubled: state.doubled,
    outcome: state.outcome,
  }, lang));

  const lines = [opts.description];
  if (!image) {
    lines.push(
      '',
      `${t(lang, 'bj_you')}: ${game.formatHand(game.getPlayerHand())} (**${game.getPlayerScore()}**)`,
      `${t(lang, 'bj_dealer')}: ${game.formatHand(game.getDealerHand(), !settled)}` +
        (settled ? ` (**${game.getDealerScore()}**)` : ''),
    );
  }
  const embed = new EmbedBuilder()
    .setTitle(brandTitle('Blackjack'))
    .setColor(opts.color)
    .setDescription(lines.join('\n'));
  if (opts.balance != null) embed.setFooter({ text: t(lang, 'bj_footer_balance')(formatUsd(opts.balance)) });
  if (image) embed.setImage('attachment://blackjack.webp');

  return {
    embeds: [embed],
    components: opts.components,
    files: image ? [imageAttachment(image, 'blackjack')] : [],
    attachments: [],
  };
}

/** Pays out and records a finished hand. Returns the settled outcome. */
async function settle(
  client: CasinoBot,
  userId: string,
  state: TableState,
): Promise<{ kind: BlackjackOutcome; net: number; achievements: string[] }> {
  const { game, doubled } = state;
  const stake = state.bet * (doubled ? 2 : 1);
  const playerBj = game.isPlayerBlackjack() && !doubled;
  const dealerBj = game.isDealerBlackjack();

  let kind: BlackjackOutcome;
  let payout = 0;
  if (game.isPlayerBust()) {
    kind = 'bust';
  } else if (playerBj && dealerBj) {
    kind = 'push';
    payout = stake;
  } else if (playerBj) {
    kind = 'blackjack';
    payout = Math.floor(stake * GAMES.blackjack.naturalMultiplier);
  } else {
    const result = game.getGameResult();
    if (result === 'win') {
      kind = 'win';
      payout = stake * 2;
    } else if (result === 'tie') {
      kind = 'push';
      payout = stake;
    } else {
      kind = 'loss';
    }
  }

  await withUserLock(userId, async () => {
    if (payout > 0) await client.db.updateMoney(userId, payout);
    const recorded = kind === 'push' ? 'tie' : payout > stake ? 'win' : 'loss';
    await client.db.recordGame(userId, 'blackjack', stake, payout, recorded);
  });
  const achievements = await client.db.checkAchievements(userId);
  return { kind, net: payout - stake, achievements };
}

function outcomeText(lang: Lang, kind: BlackjackOutcome, net: number): string {
  switch (kind) {
    case 'blackjack': return t(lang, 'bj_result_blackjack')(formatUsd(net));
    case 'win': return t(lang, 'bj_result_win')(formatUsd(net));
    case 'push': return t(lang, 'bj_result_push');
    case 'bust': return t(lang, 'bj_result_bust')(formatUsd(-net));
    default: return t(lang, 'bj_result_loss')(formatUsd(-net));
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('🃏 Blackjack przy stole krupiera - dobierz, pasuj albo podwój')
    .setDescriptionLocalizations(slashLocales('🃏 Blackjack against the dealer - hit, stand or double'))
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
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'insufficient_funds_title'), t(lang, 'error_insufficient_funds')(bet, userData.money))],
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

    const game = new BlackjackGame();
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

    const state: TableState = { game, bet, doubled: false };

    const finish = async (
      respond: (payload: Awaited<ReturnType<typeof tablePayload>>) => Promise<unknown>,
      note?: string,
    ) => {
      // The dealer draws only when the hand is still live - not after a bust or a natural.
      if (!game.isPlayerBust() && !game.isPlayerBlackjack()) game.stand();
      const result = await settle(client, userId, state);
      activeGames.delete(userId);
      state.outcome = { kind: result.kind, net: result.net };
      const balance = (await client.db.getUser(userId)).money;
      const extra = [
        note,
        outcomeText(lang, result.kind, result.net),
        result.achievements.length > 0
          ? t(lang, 'new_achievements')(formatAchievementNamesInline(result.achievements)).trim()
          : undefined,
      ].filter(Boolean).join('\n');
      const good = result.kind === 'win' || result.kind === 'blackjack';
      await respond(await tablePayload(state, lang, {
        description: extra,
        color: good ? COLORS.success : result.kind === 'push' ? COLORS.gold : COLORS.error,
        components: [bjPlayAgainRow(bet, userId, lang)],
        balance,
      }));
    };

    // A natural ends the hand before the player acts.
    if (game.isPlayerBlackjack()) {
      await finish(payload => interaction.reply(payload));
      return;
    }

    const canDouble = () =>
      game.getPlayerHand().length === 2 && !state.doubled;

    await interaction.reply(await tablePayload(state, lang, {
      description: t(lang, 'bj_prompt'),
      color: COLORS.info,
      components: [decisionRow(lang, canDouble())],
    }));
    const reply = await interaction.fetchReply();

    let busy = false;
    let settled = false;
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: DECISION_MS,
      filter: (i: ButtonInteraction) => i.user.id === userId && ['hit', 'stand', 'double'].includes(i.customId),
    });

    collector.on('collect', async (button: ButtonInteraction) => {
      if (settled || busy) {
        await button.deferUpdate().catch(() => {});
        return;
      }
      busy = true;
      try {
        if (button.customId === 'double') {
          if (!canDouble()) {
            await button.deferUpdate();
            return;
          }
          try {
            await withUserLock(userId, () => client.db.updateMoney(userId, -bet));
          } catch (error) {
            if (error instanceof InsufficientFundsError) {
              const latest = await client.db.getUser(userId);
              await button.reply({
                embeds: [EmbedHelper.errorEmbed(t(lang, 'insufficient_funds_title'), t(lang, 'error_insufficient_funds')(bet, latest.money))],
                flags: 64,
              });
              return;
            }
            throw error;
          }
          state.doubled = true;
          game.hit();
          settled = true;
          await finish(payload => button.update(payload), t(lang, 'bj_doubled_note'));
          collector.stop('done');
          return;
        }

        if (button.customId === 'hit') {
          game.hit();
          if (game.isPlayerBust() || game.getPlayerScore() === 21) {
            settled = true;
            await finish(payload => button.update(payload));
            collector.stop('done');
            return;
          }
          await button.update(await tablePayload(state, lang, {
            description: t(lang, 'bj_prompt'),
            color: COLORS.info,
            components: [decisionRow(lang, canDouble())],
          }));
          return;
        }

        settled = true;
        await finish(payload => button.update(payload));
        collector.stop('done');
      } catch (error: any) {
        if (error?.code === 10062) return;
        throw error;
      } finally {
        busy = false;
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason !== 'time' || settled || !activeGames.has(userId)) {
        if (settled) activeGames.delete(userId);
        return;
      }
      // Walking away is a stand, not a forfeit - the hand is played out.
      settled = true;
      try {
        await finish(payload => interaction.editReply(payload), t(lang, 'bj_timeout_note'));
      } catch {
        activeGames.delete(userId);
      }
    });
  },
};
