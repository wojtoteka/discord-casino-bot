import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, playAgainRow } from '../utils/embeds';
import { gameView, pendingOutcome, settledOutcome, symbolLabel } from '../utils/gameView';
import { renderWheel, safeRender } from '../render';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

const MIN_BET = 100;

const SEGMENTS = [
  { mult: 0,   p: 0.42, emoji: '💀', key: 'empty' as const },
  { mult: 0.5, p: 0.28, emoji: '🥉', key: 'half' as const },
  { mult: 1,   p: 0.14, emoji: '🔄', key: 'push' as const },
  { mult: 2,   p: 0.09, emoji: '🥈', key: 'two' as const },
  { mult: 5,   p: 0.05, emoji: '🥇', key: 'five' as const },
  { mult: 10,  p: 0.02, emoji: '👑', key: 'ten' as const },
];

function segmentLabel(lang: 'pl' | 'en', seg: typeof SEGMENTS[number]): string {
  if (seg.mult === 0) return t(lang, 'kolo_empty');
  if (seg.mult === 1) return t(lang, 'kolo_refund');
  return `${seg.mult}x`;
}

function spinWheel() {
  const r = Math.random();
  let acc = 0;
  for (const seg of SEGMENTS) {
    acc += seg.p;
    if (r < acc) return seg;
  }
  return SEGMENTS[0];
}

export default {
  data: new SlashCommandBuilder()
    .setName('kolo')
    .setNameLocalizations(slashNameLocales('wheel'))
    .setDescription('🎪 Zakręć Kołem Fortuny - wygraj nawet 10x zakładu!')
    .setDescriptionLocalizations(slashLocales('🎪 Spin the Wheel of Fortune - up to 10x'))
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

    const result = spinWheel();

    for (let i = 0; i < 2; i++) {
      await interaction.editReply(gameView({
        lang,
        title: t(lang, 'kolo_title'),
        kind: 'pending',
        image: await safeRender('kolo', () => renderWheel({
          result: null,
          spinOffset: i * 5 + Math.floor(Math.random() * 4),
          outcome: pendingOutcome(t(lang, 'card_wheel_spin'), [[t(lang, 'label_bet'), formatUsd(bet)]]),
        })),
        imageName: 'kolo',
        summary: t(lang, 'kolo_spinning'),
      }));
      await new Promise(r => setTimeout(r, 650));
    }

    const winnings = Math.floor(bet * result.mult);
    const isWin = winnings > bet;
    const isPush = winnings === bet;
    const outcome: 'win' | 'tie' | 'loss' = isWin ? 'win' : isPush ? 'tie' : 'loss';

    await withUserLock(userId, async () => {
      if (winnings > 0) await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'kolo', bet, winnings, outcome);
      await client.db.updateQuestProgress(userId, {
        play_games: 1,
        play_kolo: 1,
        wager: bet,
        ...(isWin ? { win_games: 1 } : {}),
      });
    });
    const newAchievements = await client.db.checkAchievements(userId);
    const newData = await client.db.getUser(userId);

    const row = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:kolo:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
      playAgainLabel: t(lang, 'btn_play_again'),
      balanceLabel: t(lang, 'btn_balance'),
    });

    const kind = isWin ? 'win' : isPush ? 'push' : 'loss';
    const image = await safeRender('kolo', () => renderWheel({
      result: result.mult,
      spinOffset: Math.floor(Math.random() * 6),
      outcome: settledOutcome({
        lang,
        kind,
        net: winnings - bet,
        bet,
        balance: newData.money,
        rows: [[t(lang, 'card_field'), result.mult === 0.5 ? '½×' : `${result.mult}×`]],
      }),
    }));
    await interaction.editReply(gameView({
      lang,
      title: result.mult >= 10 ? `${t(lang, 'kolo_title')} · Jackpot` : t(lang, 'kolo_title'),
      kind,
      image,
      imageName: 'kolo',
      summary: isPush ? t(lang, 'kolo_push') : `${t(lang, 'kolo_stopped')} ${t(lang, 'kolo_field')}: **${segmentLabel(lang, result)}**`,
      fallback: `${result.emoji} ${segmentLabel(lang, result)}`,
      achievements: newAchievements,
      components: [row],
    }));
  },
};
