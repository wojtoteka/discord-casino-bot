import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome } from '../utils/gameView';
import { renderCoinflip, safeRender } from '../render';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

export default {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('🪙 Rzuć monetą i postaw zakład (wygrana 2x)')
    .setDescriptionLocalizations(slashLocales('🪙 Flip a coin and bet (2x payout)'))
    .addStringOption(option =>
      option
        .setName('wybór')
        .setNameLocalizations(slashNameLocales('choice'))
        .setDescription('Wybierz orła lub reszkę')
        .setDescriptionLocalizations(slashLocales('Pick heads or tails'))
        .setRequired(true)
        .addChoices(
          { name: '🦅 Orzeł', name_localizations: slashNameLocales('🦅 Heads'), value: 'heads' },
          { name: '🌟 Reszka', name_localizations: slashNameLocales('🌟 Tails'), value: 'tails' },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $50)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $50)'))
        .setRequired(true)
        .setMinValue(50),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const choice = interaction.options.getString('wybór', true);
    const bet    = interaction.options.getInteger('zakład', true);
    const userId = interaction.user.id;
    const lang   = await getUserLang(client.db, userId);

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'error_insufficient_funds')(bet, userData.money),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

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

    const sideLabel = (side: string) => side === 'heads' ? t(lang, 'card_heads') : t(lang, 'card_tails');
    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'coinflip_title'),
      kind: 'pending',
      image: await safeRender('coinflip', () => renderCoinflip({
        face: null,
        outcome: pendingOutcome(t(lang, 'card_coin_air'), [
          [t(lang, 'label_bet'), formatUsd(bet)],
          [t(lang, 'card_type'), sideLabel(choice)],
        ]),
      })),
      imageName: 'coinflip',
      summary: t(lang, 'coinflip_spinning'),
    }));
    await new Promise(r => setTimeout(r, 1000));

    const result     = GameHelper.getRandomChoice(['heads', 'tails']);
    const won        = choice === result;
    const payout     = bet * GAMES.coinflip.payout;
    const choiceText = choice === 'heads' ? t(lang, 'coinflip_heads') : t(lang, 'coinflip_tails');
    const resultText = result === 'heads' ? t(lang, 'coinflip_heads') : t(lang, 'coinflip_tails');

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:coinflip:${bet}:${choice}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    await withUserLock(userId, async () => {
      if (won) await client.db.updateMoney(userId, payout);
      await client.db.recordGame(userId, 'coinflip', bet, won ? payout : 0, won ? 'win' : 'loss');
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        wager: bet,
        ...(won ? { win_games: 1, win_coinflip: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const kind = won ? 'win' : 'loss';
    const image = await safeRender('coinflip', () => renderCoinflip({
      face: result as 'heads' | 'tails',
      outcome: settledOutcome({
        lang,
        kind,
        net: won ? payout - bet : -bet,
        bet,
        balance: newData.money,
        rows: [
          [t(lang, 'card_type'), sideLabel(choice)],
          [t(lang, 'card_result'), sideLabel(result)],
        ],
      }),
    }));
    await interaction.editReply(gameView({
      lang,
      title: t(lang, 'coinflip_title'),
      kind,
      image,
      imageName: 'coinflip',
      summary: won ? t(lang, 'coinflip_win')(payout - bet) : t(lang, 'coinflip_loss')(bet),
      fallback: `${choiceText} → ${resultText}`,
      achievements: newAchievements,
      components: [row],
    }));
  },
};
