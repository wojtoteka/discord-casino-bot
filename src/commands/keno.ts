import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { formatUsd, gameResultEmbed, infoGameEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

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

function kenoAgainRow(bet: number, userId: string) {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:keno:${bet}`, userId),
    customIdBalance: withOwner(`nav:balance:${userId}`, userId),
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('keno')
    .setDescription('🎱 Keno - wybierz liczby, bot losuje 20. Im więcej trafień, tym większa wygrana!')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Kwota do postawienia (min. $100)')
        .setRequired(true)
        .setMinValue(MIN_BET),
    )
    .addStringOption(option =>
      option
        .setName('liczby')
        .setDescription('Twoje liczby 1-80 oddzielone spacją lub przecinkiem (1-10 liczb)')
        .setRequired(false),
    )
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setDescription('Szybki wybór: ile losowych liczb zagrać (1-10, domyślnie 5)')
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

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające środki',
        `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**`,
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
        const embed = EmbedHelper.errorEmbed(
          '❌ Błędne liczby',
          `Podaj od **1 do ${MAX_SPOTS}** liczb z zakresu **1-${POOL}**.\nPrzykład: \`/keno zakład:100 liczby:7 14 23 42 56\``,
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }
      if (valid.length > MAX_SPOTS) {
        const embed = EmbedHelper.errorEmbed(
          '❌ Za dużo liczb',
          `Możesz zagrać maksymalnie **${MAX_SPOTS}** liczb (podałeś ${valid.length}).`,
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }
      if (outOfRange) {
        const embed = EmbedHelper.errorEmbed(
          '❌ Liczby poza zakresem',
          `Wszystkie liczby muszą być z zakresu **1-${POOL}**.`,
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }
      picks = valid;
    } else {
      const count = Math.max(1, Math.min(MAX_SPOTS, quickCount ?? 5));
      picks = sampleUnique(count, POOL);
    }

    const spots = picks.length;

    await interaction.deferReply();

    await interaction.editReply({
      embeds: [pendingEmbed(
        'Keno',
        pendingList(
          `Losuję ${DRAWS} liczb...`,
          [
            ['Zakład', formatUsd(bet)],
            ['Twoje liczby', picks.slice().sort((a, b) => a - b).join('  ')],
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
    const profit = winnings - bet;
    const isWin = winnings > bet;
    const isPush = winnings === bet;
    const outcome: 'win' | 'tie' | 'loss' = isWin ? 'win' : isPush ? 'tie' : 'loss';

    await client.db.updateMoney(userId, profit);
    await client.db.recordGame(userId, 'keno', bet, winnings, outcome);
    await client.db.updateQuestProgress(userId, {
      play_games: 1,
      play_keno: 1,
      wager: bet,
      ...(isWin ? { win_games: 1 } : {}),
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    let extra: string | undefined;
    if (newAchievements.length > 0) {
      extra = `Nowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
    }

    const resultLabel = isWin
      ? `${hits.length}/${spots} · ${mult}x · +$${profit.toLocaleString()}`
      : isPush
        ? `${hits.length}/${spots} · zwrot`
        : `${hits.length}/${spots} · -$${bet.toLocaleString()}`;

    const details: Array<[string, string]> = [
      ['Twoje', formatNumbers(picks, hitSet)],
      ['Wylosowane', formatNumbers(draws, hitSet)],
    ];

    if (isPush) {
      const embed = infoGameEmbed('Keno', extra ?? 'Zwrot zakładu.', {
        bet,
        result: resultLabel,
        balance: newData.money,
        details,
      });
      await interaction.editReply({ embeds: [embed], components: [kenoAgainRow(bet, userId)] });
      return;
    }

    const embed = gameResultEmbed({
      title: 'Keno',
      won: isWin,
      bet,
      result: resultLabel,
      balance: newData.money,
      details,
      extra,
    });

    await interaction.editReply({ embeds: [embed], components: [kenoAgainRow(bet, userId)] });
  },
};
