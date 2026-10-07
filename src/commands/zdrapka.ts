import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome, symbolLabel } from '../utils/gameView';
import { renderScratch, symbolFromEmoji, safeRender } from '../render';
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
    .setDescription('🎫 Zdrap 3 pola - trzy takie same symbole = wygrana!')
    .setDescriptionLocalizations(slashLocales('🎫 Scratch 3 tiles - three matching symbols win'))
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

    const revealed: Array<string | null> = [null, null, null];
    for (let i = 0; i <= 2; i++) {
      await interaction.editReply(gameView({
        lang,
        title: t(lang, 'zdrapka_title'),
        kind: 'pending',
        image: await safeRender('zdrapka', () => renderScratch({
          cells: revealed.map(c => (c ? symbolFromEmoji(c) : null)),
          winning: false,
          outcome: pendingOutcome(t(lang, 'card_scratching'), [[t(lang, 'label_bet'), formatUsd(bet)]]),
        })),
        imageName: 'zdrapka',
        summary: i < 2 ? t(lang, 'zdrapka_scratching') : t(lang, 'zdrapka_checking'),
      }));
      await new Promise(r => setTimeout(r, 600));
      revealed[i] = finalCells[i];
    }

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

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:zdrapka:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    const kind = won ? 'win' : 'loss';
    const combo = outcome
      ? t(lang, 'card_triple')(symbolLabel(lang, symbolFromEmoji(outcome.sym)))
      : t(lang, 'card_nothing');
    const image = await safeRender('zdrapka', () => renderScratch({
      cells: finalCells.map(symbolFromEmoji),
      winning: Boolean(outcome),
      outcome: settledOutcome({
        lang,
        kind,
        net: winnings - bet,
        bet,
        balance: newData.money,
        rows: [
          [t(lang, 'card_combo'), combo],
          ...(outcome ? [[t(lang, 'card_mult'), `×${outcome.mult}`] as [string, string]] : []),
        ],
      }),
    }));
    await interaction.editReply(gameView({
      lang,
      title: outcome && outcome.mult >= 25 ? `${t(lang, 'zdrapka_title')} · Jackpot` : t(lang, 'zdrapka_title'),
      kind,
      image,
      imageName: 'zdrapka',
      summary: outcome ? t(lang, 'zdrapka_triple')(outcome.sym, outcome.mult) : t(lang, 'zdrapka_miss'),
      fallback: renderCard(finalCells),
      achievements: newAchievements,
      components: [row],
    }));
  },
};
