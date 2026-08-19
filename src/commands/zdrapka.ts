import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

const MIN_BET = 100;

const PRIZES = [
  { sym: '7️⃣', mult: 25, p: 0.002, label: '7️⃣ x3' },
  { sym: '👑', mult: 10, p: 0.013, label: '👑 x3' },
  { sym: '💎', mult: 5,  p: 0.035, label: '💎 x3' },
  { sym: '💵', mult: 3,  p: 0.07,  label: '💵 x3' },
  { sym: '🍀', mult: 2,  p: 0.18,  label: '🍀 x3' },
];

const FILLER = ['🍀', '💵', '💎', '👑', '7️⃣', '🍋', '🔔', '🍒'];
const COVER = '❔';

function rollOutcome(): { sym: string; mult: number } | null {
  const r = Math.random();
  let acc = 0;
  for (const prize of PRIZES) {
    acc += prize.p;
    if (r < acc) return { sym: prize.sym, mult: prize.mult };
  }
  return null;
}

function losingTriple(): [string, string, string] {
  const pick = () => GameHelper.getRandomChoice(FILLER);
  let a = pick(), b = pick(), c = pick();
  while (a === b && b === c) c = pick();
  return [a, b, c];
}

function renderCard(cells: string[]): string {
  return `${cells[0]} × ${cells[1]} × ${cells[2]}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('zdrapka')
    .setNameLocalizations(slashNameLocales('scratch'))
    .setDescription('🎟️ Zdrap 3 pola - trzy takie same symbole = wygrana!')
    .setDescriptionLocalizations(slashLocales('Scratch 3 tiles — three matching symbols win'))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription('Kwota do postawienia (min. $100)')
        .setDescriptionLocalizations(slashLocales('Amount to bet (min. $100)'))
        .setRequired(true)
        .setMinValue(MIN_BET),
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

    const outcome = rollOutcome();
    const finalCells: string[] = outcome
      ? [outcome.sym, outcome.sym, outcome.sym]
      : losingTriple();

    const cells = [COVER, COVER, COVER];
    await interaction.editReply({
      embeds: [pendingEmbed(
        t(lang, 'zdrapka_title'),
        pendingList(t(lang, 'zdrapka_scratching'), [[t(lang, 'label_bet'), formatUsd(bet)]], renderCard(cells)),
      )],
    });

    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 650));
      cells[i] = finalCells[i];
      await interaction.editReply({
        embeds: [pendingEmbed(
          t(lang, 'zdrapka_title'),
          pendingList(
            i < 2 ? t(lang, 'zdrapka_scratching') : t(lang, 'zdrapka_checking'),
            [[t(lang, 'label_bet'), formatUsd(bet)]],
            renderCard(cells),
          ),
        )],
      });
    }

    await new Promise(r => setTimeout(r, 400));

    const winnings = outcome ? Math.floor(bet * outcome.mult) : 0;
    const won = winnings > bet;

    await withUserLock(userId, async () => {
      if (winnings > 0) await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'zdrapka', bet, winnings, won ? 'win' : 'loss');
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        play_zdrapka: 1,
        wager: bet,
        ...(won ? { win_games: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    let extra = outcome
      ? t(lang, 'zdrapka_triple')(outcome.sym, outcome.mult)
      : t(lang, 'zdrapka_miss');
    if (newAchievements.length > 0) {
      extra += t(lang, 'new_achievements')(formatAchievementNamesInline(newAchievements));
    }

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:zdrapka:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    const embed = gameResultEmbed({
      title: outcome && outcome.mult >= 25 ? `${t(lang, 'zdrapka_title')} · Jackpot` : t(lang, 'zdrapka_title'),
      won,
      bet,
      result: renderCard(finalCells),
      balance: newData.money,
      extra,
      lang,
    });
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
