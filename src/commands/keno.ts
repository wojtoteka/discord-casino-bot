import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, gameResultEmbed, infoGameEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

const MIN_BET = 100;
const POOL = 80;
const DRAWS = 20;
const MAX_SPOTS = 10;

const PAYTABLE: Record<number, Record<number, number>> = {
  1:  { 1: 3 },
  2:  { 2: 9 },
  3:  { 2: 1, 3: 16 },
  4:  { 2: 1, 3: 3, 4: 30 },
  5:  { 3: 2, 4: 8, 5: 50 },
  6:  { 3: 1, 4: 3, 5: 15, 6: 75 },
  7:  { 4: 2, 5: 6, 6: 25, 7: 100 },
  8:  { 4: 1, 5: 3, 6: 12, 7: 50, 8: 200 },
  9:  { 4: 1, 5: 2, 6: 6, 7: 25, 8: 80, 9: 300 },
  10: { 5: 2, 6: 4, 7: 18, 8: 80, 9: 250, 10: 500 },
};

function sampleUnique(count: number, max: number): number[] {
  const set = new Set<number>();
  while (set.size < count) set.add(GameHelper.getRandomNumber(1, max));
  return [...set];
}

function formatNumbers(nums: number[], hitSet: Set<number>): string {
  return nums
    .slice()
    .sort((a, b) => a - b)
    .map(n => (hitSet.has(n) ? `**__${n}__**` : `${n}`))
    .join('  ');
}

function encodePicks(picks: number[]): string {
  return picks.slice().sort((a, b) => a - b).join(',');
}

export default {
  data: new SlashCommandBuilder()
    .setName('keno')
    .setDescription('🎱 Keno - wybierz liczby, bot losuje 20. Im więcej trafień, tym większa wygrana!')
    .setDescriptionLocalizations(slashLocales('🎱 Keno - pick numbers, 20 are drawn. More hits, bigger payout'))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $100)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $100)'))
        .setRequired(true)
        .setMinValue(MIN_BET),
    )
    .addStringOption(option =>
      option
        .setName('liczby')
        .setNameLocalizations(slashNameLocales('numbers'))
        .setDescription('Twoje liczby 1-80 oddzielone spacją lub przecinkiem (1-10 liczb)')
        .setDescriptionLocalizations(slashLocales('Your numbers 1-80 separated by a space or comma (1-10 numbers)'))
        .setRequired(false),
    )
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setNameLocalizations(slashNameLocales('count'))
        .setDescription('Szybki wybór: ile losowych liczb zagrać (1-10, domyślnie 5)')
        .setDescriptionLocalizations(slashLocales('Quick pick: how many random numbers to play (1-10, default 5)'))
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(MAX_SPOTS),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
    const rawNumbers = interaction.options.getString('liczby');
    const quickCount = interaction.options.getInteger('ile');
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

    let picks: number[];
    if (rawNumbers && rawNumbers.trim()) {
      const parsed = [...new Set(
        rawNumbers.split(/[^0-9]+/).filter(Boolean).map(n => parseInt(n, 10)),
      )];
      const valid = parsed.filter(n => n >= 1 && n <= POOL);
      const outOfRange = parsed.length !== valid.length;

      if (valid.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(t(lang, 'keno_bad_title'), t(lang, 'keno_bad')(MAX_SPOTS, POOL))],
          flags: 64,
        });
        return;
      }
      if (valid.length > MAX_SPOTS) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'keno_too_many')(MAX_SPOTS, valid.length))],
          flags: 64,
        });
        return;
      }
      if (outOfRange) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'keno_range')(POOL))],
          flags: 64,
        });
        return;
      }
      picks = valid;
    } else {
      const count = Math.max(1, Math.min(MAX_SPOTS, quickCount ?? 5));
      picks = sampleUnique(count, POOL);
    }

    const spots = picks.length;

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

    await interaction.editReply({
      embeds: [pendingEmbed(
        t(lang, 'keno_title'),
        pendingList(
          t(lang, 'keno_drawing')(DRAWS),
          [
            [t(lang, 'label_bet'), formatUsd(bet)],
            [t(lang, 'keno_picks'), picks.slice().sort((a, b) => a - b).join('  ')],
          ],
        ),
      )],
    });
    await new Promise(r => setTimeout(r, 1100));

    const draws = sampleUnique(DRAWS, POOL);
    const drawSet = new Set(draws);
    const hits = picks.filter(p => drawSet.has(p));
    const hitSet = new Set(hits);

    const mult = PAYTABLE[spots]?.[hits.length] ?? 0;
    const winnings = Math.floor(bet * mult);
    const isWin = winnings > bet;
    const isPush = winnings === bet;
    const outcome: 'win' | 'tie' | 'loss' = isWin ? 'win' : isPush ? 'tie' : 'loss';

    await withUserLock(userId, async () => {
      if (winnings > 0) await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'keno', bet, winnings, outcome);
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        play_keno: 1,
        wager: bet,
        ...(isWin ? { win_games: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const extra = newAchievements.length > 0
      ? t(lang, 'new_achievements')(formatAchievementNamesInline(newAchievements)).trim()
      : undefined;

    const resultLabel = `${hits.length}/${spots}${mult > 0 ? ` · ${mult}x` : ''}`;
    const details: Array<[string, string]> = [
      [t(lang, 'keno_your'), formatNumbers(picks, hitSet)],
      [t(lang, 'keno_drawn'), formatNumbers(draws, hitSet)],
    ];

    const again = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:keno:${bet}:${encodePicks(picks)}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    if (isPush) {
      const embed = infoGameEmbed(t(lang, 'keno_title'), extra ?? t(lang, 'keno_push'), {
        bet,
        result: resultLabel,
        balance: newData.money,
        details,
        lang,
      });
      await interaction.editReply({ embeds: [embed], components: [again] });
      return;
    }

    const embed = gameResultEmbed({
      title: t(lang, 'keno_title'),
      won: isWin,
      bet,
      result: resultLabel,
      balance: newData.money,
      details,
      extra,
      lang,
    });

    await interaction.editReply({ embeds: [embed], components: [again] });
  },
};
