import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome, symbolLabel } from '../utils/gameView';
import { renderSlots, symbolFromEmoji, safeRender } from '../render';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('🎰 Zagraj na automacie - postaw od 1 do 20 kredytów!')
    .setDescriptionLocalizations(slashLocales('🎰 Slot machine - bet 1 to 20 credits'))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Liczba kredytów do postawienia (1-20)')
        .setDescriptionLocalizations(slashLocales('How many credits to bet (1-20)'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(GAMES.slots.maxBet),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
    const userId = interaction.user.id;
    const lang = await getUserLang(client.db, userId);

    if (bet > GAMES.slots.maxBet) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'max_bet_title'), t(lang, 'error_insufficient_credits')(bet, 0))],
        flags: 64,
      });
      return;
    }

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAffordCredits(userData.credits, bet)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_credits_title'),
        t(lang, 'error_insufficient_credits')(bet, userData.credits),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const symbolPool = [
      '🍒', '🍒', '🍒', '🍒', '🍒',
      '🍋', '🍋', '🍋', '🍋',
      '🍊', '🍊', '🍊',
      '🍇', '🍇',
      '⭐',
      '💎',
    ];

    const payouts: { [key: string]: number } = {
      '🍒': 3, '🍋': 5, '🍊': 10, '🍇': 20, '⭐': 50, '💎': 100,
    };

    const twoOfKindMultiplier: { [key: string]: number } = {
      '🍒': 0, '🍋': 1, '🍊': 2, '🍇': 3, '⭐': 5, '💎': 10,
    };

    await interaction.deferReply();

    try {
      await withUserLock(userId, () => client.db.updateCredits(userId, -bet));
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const latest = await client.db.getUser(userId);
        await interaction.editReply({
          embeds: [EmbedHelper.errorEmbed(
            t(lang, 'insufficient_credits_title'),
            t(lang, 'error_insufficient_credits')(bet, latest.credits),
          )],
        });
        return;
      }
      throw error;
    }

    const reel1 = GameHelper.getRandomChoice(symbolPool);
    const reel2 = GameHelper.getRandomChoice(symbolPool);
    const reel3 = GameHelper.getRandomChoice(symbolPool);

    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'slots_title'),
      kind: 'pending',
      image: await safeRender('slots', () => renderSlots({
        reels: null,
        outcome: pendingOutcome(t(lang, 'card_reels'), [[t(lang, 'label_bet'), `${bet} ${t(lang, 'card_credits_short')}`]]),
      })),
      imageName: 'slots',
      summary: t(lang, 'slots_spinning'),
    }));
    await new Promise(resolve => setTimeout(resolve, 900));

    let winnings = 0;
    let combo = t(lang, 'card_nothing');
    let summary = t(lang, 'slots_none');
    const winning = [false, false, false];

    if (reel1 === reel2 && reel2 === reel3) {
      const multiplier = payouts[reel1];
      winnings = multiplier * bet;
      combo = t(lang, 'card_triple')(symbolLabel(lang, symbolFromEmoji(reel1)));
      summary = reel1 === '💎' ? t(lang, 'slots_jackpot') : t(lang, 'slots_triple')(reel1, multiplier);
      winning.fill(true);
    } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
      const matchedSymbol = reel1 === reel2 ? reel1 : (reel2 === reel3 ? reel2 : reel1);
      const multiplier = twoOfKindMultiplier[matchedSymbol];
      if (multiplier > 0) {
        winnings = multiplier * bet;
        combo = t(lang, 'card_pair')(symbolLabel(lang, symbolFromEmoji(matchedSymbol)));
        summary = t(lang, 'slots_two');
        [reel1, reel2, reel3].forEach((r, i) => { winning[i] = r === matchedSymbol; });
      }
    }

    const won = winnings > bet;
    const result = won ? 'win' : (winnings > 0 ? 'tie' : 'loss');

    await withUserLock(userId, async () => {
      if (winnings > 0) await client.db.updateCredits(userId, winnings);
      await client.db.recordGame(userId, 'slots', bet, winnings, result, { trackMoneyStats: false });
      await client.db.updateQuestProgress(userId, {
        play_slots: 1,
        play_games: 1,
        ...(result === 'win' ? { win_games: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newUserData = await client.db.getUser(userId);

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:slots:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    const kind = result === 'win' ? 'win' : result === 'tie' ? 'push' : 'loss';
    const image = await safeRender('slots', () => renderSlots({
      reels: [reel1, reel2, reel3].map(symbolFromEmoji),
      winning,
      outcome: settledOutcome({
        lang,
        kind,
        net: winnings - bet,
        bet,
        balance: newUserData.credits,
        unit: 'credits',
        rows: [[t(lang, 'card_combo'), combo]],
      }),
    }));

    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'slots_title'),
      kind,
      image,
      imageName: 'slots',
      summary,
      fallback: `${reel1} ${reel2} ${reel3}`,
      achievements: newAchievements,
      components: [row],
    }));
  },
};
